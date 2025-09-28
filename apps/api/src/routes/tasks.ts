import { Router, Request, Response } from 'express';
import { supabase } from '../services/database';

const router: Router = Router();

// GET /tasks - Get all tasks for a user
router.get('/', async (req: Request, res: Response) => {
  try {
    const { user_id } = req.query;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tasks:', error);
      return res.status(500).json({ error: 'Failed to fetch tasks' });
    }

    res.json({ tasks: data || [] });
  } catch (error) {
    console.error('Error in GET /tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /tasks - Add a new task
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, category, user_id, duration } = req.body;

    if (!name || !user_id) {
      return res.status(400).json({ error: 'name and user_id are required' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        name,
        description: description || null,
        category: category || null,
        user_id,
        duration: duration || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating task:', error);
      return res.status(500).json({ error: 'Failed to create task' });
    }

    res.status(201).json({ task: data });
  } catch (error) {
    console.error('Error in POST /tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /tasks/:id - Edit a task
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, category, duration, status } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({
        name,
        description: description || null,
        category: category || null,
        duration: duration || null,
        updated_at: new Date().toISOString(),
        status: status || null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating task:', error);
      return res.status(500).json({ error: 'Failed to update task' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({ task: data });
  } catch (error) {
    console.error('Error in PUT /tasks/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /tasks/:id - Delete a task
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting task:', error);
      return res.status(500).json({ error: 'Failed to delete task' });
    }

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /tasks/:id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 