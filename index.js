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

app.get('/', (req, res) => {
  res.send({ message: 'WedPlan server is running' });
});

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
