import { Router } from 'express';
import { z } from 'zod';
import { getAdminEmails as getEnvAdminEmails } from '@/config/environment.js';
import { authenticateToken, invalidateAdminCache, requireAdmin } from '@/middleware/auth.js';
import { getSupabaseClient } from '@/services/supabase.js';

const router = Router();

// GET /check — Check if the current user is an admin (auth required, admin NOT required)
router.get('/check', authenticateToken, (req, res) => {
  res.json({ isAdmin: req.user?.isAdmin ?? false });
});

router.use(authenticateToken, requireAdmin);

const EmailSchema = z.object({
  email: z
    .string()
    .email()
    .transform((e) => e.toLowerCase().trim()),
});

// GET / — List all admin emails (DB + env var, with source labels)
router.get('/', async (_req, res, next) => {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }
    const { data, error } = await supabase
      .from('admin_emails')
      .select('id, email, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Failed to list admin emails' });
    }

    const envEmails = getEnvAdminEmails();

    const admins = [
      ...envEmails.map((email) => ({
        email,
        source: 'env' as const,
        removable: false,
      })),
      ...(data ?? [])
        .filter((row) => !envEmails.includes(row.email.toLowerCase()))
        .map((row) => ({
          id: row.id,
          email: row.email,
          source: 'database' as const,
          removable: true,
          createdAt: row.created_at,
        })),
    ];

    res.json({ admins });
  } catch (error) {
    next(error);
  }
});

// POST / — Add an admin email
router.post('/', async (req, res, next) => {
  try {
    const { email } = EmailSchema.parse(req.body);
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }

    const { data, error } = await supabase.from('admin_emails').insert({ email }).select().single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Email already exists' });
      }
      return res.status(500).json({ error: 'Failed to add admin email' });
    }

    invalidateAdminCache();
    res.status(201).json({
      id: data.id,
      email: data.email,
      source: 'database',
      removable: true,
      createdAt: data.created_at,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /:id — Remove an admin email (DB entries only)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }

    const { data, error } = await supabase
      .from('admin_emails')
      .delete()
      .eq('id', id)
      .select('id')
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Admin email not found' });
    }

    invalidateAdminCache();
    res.json({ message: 'Admin email removed', id: data.id });
  } catch (error) {
    next(error);
  }
});

export default router;
