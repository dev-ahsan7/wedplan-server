import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { MongoClient, ObjectId } from 'mongodb';

const app = express();
const PORT = process.env.PORT || 8100;
const CLIENT_URL = process.env.CLIENT_URL;

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db('wedPlan');

// Better Auth keeps users in the "user" collection
const usersCollection = db.collection('user');
const servicesCollection = db.collection('services');
const bookingsCollection = db.collection('bookings');
const transactionsCollection = db.collection('transactions');

// Public keys from the client's Better Auth, used to check tokens
const JWKS = createRemoteJWKSet(new URL(`${CLIENT_URL}/api/auth/jwks`));

// Checks the token, then loads the user from the database so role and
// blocked status are always fresh (never taken from the request body)
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'Please sign in first' });
  }

  let payload;
  try {
    const result = await jwtVerify(token, JWKS, {
      issuer: CLIENT_URL,
      audience: CLIENT_URL,
    });
    payload = result.payload;
  } catch {
    return res.status(401).send({ message: 'Invalid or expired token' });
  }

  if (!ObjectId.isValid(payload.sub)) {
    return res.status(401).send({ message: 'Invalid token' });
  }

  const user = await usersCollection.findOne({ _id: new ObjectId(payload.sub) });
  if (!user) {
    return res.status(401).send({ message: 'User not found' });
  }
  if (user.isBlocked) {
    return res.status(403).send({ message: 'Your account has been blocked' });
  }

  req.user = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    businessName: user.businessName,
    subscriptionPlan: user.subscriptionPlan || 'free',
  };
  next();
};

// Use after verifyToken, for example verifyRole('admin')
const verifyRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).send({ message: 'You do not have access to this' });
    }
    next();
  };
};

const CATEGORIES = [
  'Photography & Videography',
  'Wedding Venues',
  'Decoration & Florist',
  'Catering Services',
  'Makeup & Styling',
  'Wedding Fashion',
];
const FREE_ACTIVE_LIMIT = 3;

// Makes user text safe to use inside a regex search
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Keeps only the fields a vendor can set, so nobody can send their own status or owner
const getServiceFields = (body) => {
  const { serviceName, category, description, location } = body;
  const price = Number(body.price);
  const images = Array.isArray(body.images)
    ? body.images.filter((url) => typeof url === 'string' && url.startsWith('https://'))
    : [];

  if (!serviceName?.trim() || !description?.trim() || !location?.trim()) {
    return { error: 'Please fill in all the fields' };
  }
  if (!CATEGORIES.includes(category)) {
    return { error: 'Please choose a valid category' };
  }
  if (!Number.isFinite(price) || price <= 0) {
    return { error: 'Price must be more than 0' };
  }
  if (images.length === 0 || images.length > 5) {
    return { error: 'Please add between 1 and 5 images' };
  }

  return {
    fields: {
      serviceName: serviceName.trim(),
      category,
      description: description.trim(),
      price,
      location: location.trim(),
      images,
    },
  };
};

// Adds the vendor's public info to each service (never their email)
const withVendor = [
  {
    $lookup: {
      from: 'user',
      localField: 'vendorId',
      foreignField: '_id',
      pipeline: [
        {
          $project: {
            name: 1,
            businessName: 1,
            image: 1,
            isBlocked: 1,
            subscriptionPlan: 1,
          },
        },
      ],
      as: 'vendor',
    },
  },
  { $unwind: '$vendor' },
];

// Services that count toward the free plan limit
const countActiveServices = (vendorId) => {
  return servicesCollection.countDocuments({
    vendorId: new ObjectId(vendorId),
    isActive: true,
    status: { $ne: 'rejected' },
  });
};

const limitMessage = `Free vendors can have ${FREE_ACTIVE_LIMIT} active services. Upgrade to Premium for unlimited services.`;

app.get('/', (req, res) => {
  res.send({ message: 'WedPlan server is running' });
});

// Public list: only approved and active services from vendors that aren't blocked
app.get('/services', async (req, res) => {
  const { search, category, location, sort, limit } = req.query;
  const query = { status: 'approved', isActive: true };

  // Search looks at the name, category, location and description
  if (search?.trim()) {
    const text = new RegExp(escapeRegex(search.trim()), 'i');
    query.$or = [
      { serviceName: text },
      { category: text },
      { location: text },
      { description: text },
    ];
  }
  if (CATEGORIES.includes(category)) {
    query.category = category;
  }
  if (location?.trim()) {
    query.location = new RegExp(escapeRegex(location.trim()), 'i');
  }

  let sortBy = { createdAt: -1 };
  if (sort === 'price_asc') sortBy = { price: 1 };
  if (sort === 'price_desc') sortBy = { price: -1 };

  const pipeline = [
    { $match: query },
    ...withVendor,
    { $match: { 'vendor.isBlocked': { $ne: true } } },
    { $sort: sortBy },
  ];
  if (Number(limit) > 0) {
    pipeline.push({ $limit: Number(limit) });
  }

  const services = await servicesCollection.aggregate(pipeline).toArray();
  res.send(services);
});

// Locations for the filter dropdown on the Browse page
app.get('/services/locations', async (req, res) => {
  const locations = await servicesCollection.distinct('location', {
    status: 'approved',
    isActive: true,
  });
  res.send(locations.sort());
});

app.get('/services/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'Service not found' });
  }

  const [service] = await servicesCollection
    .aggregate([{ $match: { _id: new ObjectId(id) } }, ...withVendor])
    .toArray();
  if (!service) {
    return res.status(404).send({ message: 'Service not found' });
  }

  // Customers only see approved and active services, the owner and admins see all
  const isOwner = service.vendorId.toString() === req.user.id;
  const isPublic =
    service.status === 'approved' && service.isActive && !service.vendor.isBlocked;
  if (!isPublic && !isOwner && req.user.role !== 'admin') {
    return res.status(404).send({ message: 'Service not found' });
  }

  res.send(service);
});

app.post('/services', verifyToken, verifyRole('vendor'), async (req, res) => {
  const { fields, error } = getServiceFields(req.body);
  if (error) {
    return res.status(400).send({ message: error });
  }

  if (req.user.subscriptionPlan !== 'premium') {
    const activeCount = await countActiveServices(req.user.id);
    if (activeCount >= FREE_ACTIVE_LIMIT) {
      return res.status(403).send({ message: limitMessage });
    }
  }

  const result = await servicesCollection.insertOne({
    vendorId: new ObjectId(req.user.id),
    ...fields,
    status: 'pending',
    isActive: true,
    createdAt: new Date(),
  });

  res.status(201).send({ message: 'Service sent for review', id: result.insertedId });
});

// Services of the logged in vendor, with their approval status
app.get('/vendor/services', verifyToken, verifyRole('vendor'), async (req, res) => {
  const services = await servicesCollection
    .find({ vendorId: new ObjectId(req.user.id) })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(services);
});

// Finds a service and checks that the logged in vendor owns it
const findOwnService = async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    res.status(404).send({ message: 'Service not found' });
    return null;
  }

  const service = await servicesCollection.findOne({ _id: new ObjectId(id) });
  if (!service) {
    res.status(404).send({ message: 'Service not found' });
    return null;
  }
  if (service.vendorId.toString() !== req.user.id) {
    res.status(403).send({ message: 'You can only change your own services' });
    return null;
  }

  return service;
};

app.patch('/services/:id', verifyToken, verifyRole('vendor'), async (req, res) => {
  const service = await findOwnService(req, res);
  if (!service) return;

  const { fields, error } = getServiceFields(req.body);
  if (error) {
    return res.status(400).send({ message: error });
  }

  // A changed service goes back to the admin for review
  await servicesCollection.updateOne(
    { _id: service._id },
    { $set: { ...fields, status: 'pending' } },
  );

  res.send({ message: 'Service updated and sent for review' });
});

// Vendor turns a service on or off
app.patch(
  '/services/:id/availability',
  verifyToken,
  verifyRole('vendor'),
  async (req, res) => {
    const service = await findOwnService(req, res);
    if (!service) return;

    const isActive = req.body.isActive === true;
    if (isActive && !service.isActive && req.user.subscriptionPlan !== 'premium') {
      const activeCount = await countActiveServices(req.user.id);
      if (activeCount >= FREE_ACTIVE_LIMIT) {
        return res.status(403).send({ message: limitMessage });
      }
    }

    await servicesCollection.updateOne({ _id: service._id }, { $set: { isActive } });
    res.send({ message: isActive ? 'Service is now available' : 'Service is now hidden' });
  },
);

// Vendors delete their own services, admins can delete any service
app.delete('/services/:id', verifyToken, verifyRole('vendor', 'admin'), async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(404).send({ message: 'Service not found' });
  }

  const service = await servicesCollection.findOne({ _id: new ObjectId(id) });
  if (!service) {
    return res.status(404).send({ message: 'Service not found' });
  }
  if (req.user.role === 'vendor' && service.vendorId.toString() !== req.user.id) {
    return res.status(403).send({ message: 'You can only delete your own services' });
  }

  await servicesCollection.deleteOne({ _id: service._id });
  res.send({ message: 'Service deleted' });
});

// Admin: every service, with search and a status filter
app.get('/admin/services', verifyToken, verifyRole('admin'), async (req, res) => {
  const { search, status } = req.query;
  const query = {};

  if (search?.trim()) {
    const text = new RegExp(escapeRegex(search.trim()), 'i');
    query.$or = [{ serviceName: text }, { category: text }, { location: text }];
  }
  if (['pending', 'approved', 'rejected'].includes(status)) {
    query.status = status;
  }

  const services = await servicesCollection
    .aggregate([{ $match: query }, ...withVendor, { $sort: { createdAt: -1 } }])
    .toArray();

  res.send(services);
});

app.patch(
  '/admin/services/:id/status',
  verifyToken,
  verifyRole('admin'),
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(404).send({ message: 'Service not found' });
    }
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).send({ message: 'Please choose a valid status' });
    }

    const result = await servicesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } },
    );
    if (result.matchedCount === 0) {
      return res.status(404).send({ message: 'Service not found' });
    }

    res.send({ message: `Service marked as ${status}` });
  },
);

// The logged in user, as the server sees them
app.get('/users/me', verifyToken, (req, res) => {
  res.send(req.user);
});

app.get('/admin/overview', verifyToken, verifyRole('admin'), async (req, res) => {
  const [
    totalUsers,
    totalVendors,
    totalCustomers,
    totalServices,
    pendingServices,
    totalTransactions,
  ] = await Promise.all([
    usersCollection.countDocuments(),
    usersCollection.countDocuments({ role: 'vendor' }),
    usersCollection.countDocuments({ role: 'customer' }),
    servicesCollection.countDocuments(),
    servicesCollection.countDocuments({ status: 'pending' }),
    transactionsCollection.countDocuments(),
  ]);

  res.send({
    totalUsers,
    totalVendors,
    totalCustomers,
    totalServices,
    pendingServices,
    totalTransactions,
  });
});

app.use((req, res) => {
  res.status(404).send({ message: 'Route not found' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).send({ message: 'Something went wrong on the server' });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

export default app;
