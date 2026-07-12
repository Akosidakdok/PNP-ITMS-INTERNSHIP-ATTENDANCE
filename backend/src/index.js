import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { loginUser } from './auth.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await loginUser(username, password);
    return res.json(result);
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'PNP ITMS backend is running' });
});

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
