// Gives an existing account the admin role.
// Admins can't sign up from the website, so run this once from the terminal:
//   npm run make-admin -- admin@example.com
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const email = process.argv[2];
if (!email) {
  console.log('Usage: npm run make-admin -- <email>');
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);

try {
  const result = await client
    .db('wedPlan')
    .collection('user')
    .updateOne({ email }, { $set: { role: 'admin' }, $unset: { businessName: '' } });

  if (result.matchedCount === 0) {
    console.log(`No account found for ${email}. Sign up on the website first.`);
  } else {
    console.log(`${email} is now an admin.`);
  }
} finally {
  await client.close();
}
