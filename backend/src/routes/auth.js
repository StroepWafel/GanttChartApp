import express from 'express';
import { login, isAuthEnabled } from '../auth.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ enabled: isAuthEnabled() });
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    const token = await login(email, password);
    if (!token) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
