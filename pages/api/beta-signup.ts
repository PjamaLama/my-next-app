import { promises as fs } from 'fs';
import path from 'path';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || !/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
    return res.status(400).json({ message: 'Invalid email address' });
  }

  const betaUsersPath = path.join(process.cwd(), 'beta-users.json');

  try {
    let betaUsers = [];
    try {
      const data = await fs.readFile(betaUsersPath, 'utf-8');
      betaUsers = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, which is fine.
    }

    if (betaUsers.includes(email)) {
      return res.status(200).json({ message: "You're already on the beta list!" });
    }

    if (betaUsers.length >= 100) {
      return res.status(400).json({ message: 'Sorry, the beta is full. Please check back later.' });
    }

    betaUsers.push(email);
    await fs.writeFile(betaUsersPath, JSON.stringify(betaUsers, null, 2));

    res.status(200).json({ message: 'Thanks for joining the beta! We will be in touch soon.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'An internal error occurred.' });
  }
}
