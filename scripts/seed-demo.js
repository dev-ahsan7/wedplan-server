// Adds demo vendors and services so the site has something to show.
// Run it again any time: it removes the old demo data first.
//   npm run seed-demo
// Demo vendors have no password, so nobody can log in as them.
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const photo = (id) =>
  `https://images.unsplash.com/photo-${id}?w=1200&q=80&auto=format&fit=crop`;

const vendors = [
  { key: 'golden', name: 'Rafiq Hasan', businessName: 'Golden Hour Studio' },
  { key: 'glasshouse', name: 'Imran Kabir', businessName: 'The Glasshouse Hall' },
  { key: 'bloom', name: 'Nusrat Jahan', businessName: 'Bloom & Petal Florist' },
  { key: 'saffron', name: 'Tanvir Ahmed', businessName: 'Saffron Table Catering' },
  { key: 'glow', name: 'Nadia Rahman', businessName: 'Glow by Nadia' },
  { key: 'ivory', name: 'Farhana Akter', businessName: 'Ivory Thread Couture' },
];

const services = [
  {
    vendor: 'golden',
    serviceName: 'Full Day Wedding Photography',
    category: 'Photography & Videography',
    price: 45000,
    location: 'Dhaka',
    description:
      'Two photographers from the morning preparations to the last dance. You get 500+ edited photos in an online gallery within three weeks, plus a 40 page printed album.',
    images: ['1769374071122-402f308001bf', '1757647630063-dd5cd82271f3', '1583939003579-730e3918a45a'],
  },
  {
    vendor: 'golden',
    serviceName: 'Cinematic Wedding Film',
    category: 'Photography & Videography',
    price: 60000,
    location: 'Dhaka',
    description:
      'A 6 to 8 minute highlight film with music, plus the full ceremony and speeches. Shot in 4K with drone footage when the venue allows it.',
    images: ['1648154164366-d067faecdc51', '1617724975854-70b5d0cedb0a'],
  },
  {
    vendor: 'glasshouse',
    serviceName: 'Grand Ballroom for 400 Guests',
    category: 'Wedding Venues',
    price: 250000,
    location: 'Gulshan, Dhaka',
    description:
      'A chandelier lit hall with round tables, a stage, bridal room and parking for 120 cars. In house lighting and sound are included for six hours.',
    images: ['1723832348105-2e69f948135a', '1775126964424-913480443772'],
  },
  {
    vendor: 'glasshouse',
    serviceName: 'Garden Ceremony Lawn',
    category: 'Wedding Venues',
    price: 120000,
    location: 'Purbachal, Dhaka',
    description:
      'An open lawn with a floral arch, white chairs for 200 guests and a covered area in case of rain. Perfect for daytime ceremonies and holud evenings.',
    images: ['1780728955106-48b649e0dd8f', '1769812344081-92b3e2ac39c0'],
  },
  {
    vendor: 'bloom',
    serviceName: 'Stage and Entrance Decoration',
    category: 'Decoration & Florist',
    price: 85000,
    location: 'Dhaka',
    description:
      'Fresh flower stage, entrance gate and table centrepieces in your colours. We set up the day before and take everything down after the event.',
    images: ['1724847664831-27b55fef3121', '1607861876572-07754b7bba0d'],
  },
  {
    vendor: 'bloom',
    serviceName: 'Bridal Bouquet and Flower Jewellery',
    category: 'Decoration & Florist',
    price: 12000,
    location: 'Chattogram',
    description:
      'A hand tied bouquet with matching flower jewellery for the bride, and boutonnieres for the groom and both fathers.',
    images: ['1525258946800-98cfd641d0de', '1521520368710-3ab197656d60'],
  },
  {
    vendor: 'saffron',
    serviceName: 'Wedding Buffet for 300 Guests',
    category: 'Catering Services',
    price: 180000,
    location: 'Sylhet',
    description:
      'Kacchi biryani, roast, kebab, salads and three desserts, served by our own uniformed staff. A free tasting session for two before you book.',
    images: ['1637059395523-d5a35541d544', '1565898094840-7e408a6f361d', '1561593367-66c79c2294e6'],
  },
  {
    vendor: 'glow',
    serviceName: 'Bridal Makeup and Hair',
    category: 'Makeup & Styling',
    price: 25000,
    location: 'Dhaka',
    description:
      'Airbrush makeup, hair styling and saree draping on the wedding day, with a trial session one week before. Travel inside Dhaka is included.',
    images: ['1773688189414-7637b9b138e1', '1774814305111-8298b8cde459'],
  },
  {
    vendor: 'ivory',
    serviceName: 'Custom Bridal Gown',
    category: 'Wedding Fashion',
    price: 70000,
    location: 'Chattogram',
    description:
      'A gown designed and stitched for you over three fittings. Choose the fabric, lace and train length with our designer.',
    images: ['1622277430358-f4d134452e2e', '1599142296733-1c1f2073e6de'],
  },
  {
    vendor: 'saffron',
    serviceName: 'Dessert Table',
    category: 'Catering Services',
    price: 30000,
    location: 'Sylhet',
    description:
      'A styled dessert table with a two tier cake, mishti and cupcakes. This one waits for admin review, so it does not show on the public pages.',
    images: ['1603798125683-c3a62f748b62'],
    status: 'pending',
  },
];

const client = new MongoClient(process.env.MONGODB_URI);

try {
  const db = client.db('wedPlan');
  const users = db.collection('user');
  const servicesCollection = db.collection('services');

  // Remove the old demo data first
  const oldVendors = await users.find({ isDemo: true }).toArray();
  await servicesCollection.deleteMany({
    vendorId: { $in: oldVendors.map((vendor) => vendor._id) },
  });
  await users.deleteMany({ isDemo: true });

  const vendorIds = {};
  for (const vendor of vendors) {
    const now = new Date();
    const result = await users.insertOne({
      name: vendor.name,
      email: `${vendor.key}@demo.wedplan.app`,
      emailVerified: false,
      image: null,
      role: 'vendor',
      businessName: vendor.businessName,
      isBlocked: false,
      subscriptionPlan: vendor.key === 'golden' ? 'premium' : 'free',
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    });
    vendorIds[vendor.key] = result.insertedId;
  }

  // Spread the dates out so "newest first" has a real order
  const docs = services.map((service, index) => ({
    vendorId: vendorIds[service.vendor],
    serviceName: service.serviceName,
    category: service.category,
    description: service.description,
    price: service.price,
    location: service.location,
    images: service.images.map(photo),
    status: service.status || 'approved',
    isActive: true,
    createdAt: new Date(Date.now() - index * 60 * 60 * 1000),
  }));
  await servicesCollection.insertMany(docs);

  console.log(`Added ${vendors.length} demo vendors and ${docs.length} services.`);
} finally {
  await client.close();
}
