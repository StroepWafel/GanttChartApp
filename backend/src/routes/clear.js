import express from 'express';
import db from '../db.js';

const router = express.Router();

router.delete('/', (req, res) => {
  try {
    db.exec(`
      DELETE FROM tasks;
      DELETE FROM projects;
      DELETE FROM categories;
    `);
    res.json({ ok: true, message: 'All data cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
