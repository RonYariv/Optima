import express from 'express';
import type { Server } from 'http';

const app = express();
app.use(express.json());

app.post('/mcp', (req, res) => {
  const { method, params, id } = req.body as { method: string; params: { name: string }; id: unknown };

  if (method === 'tools/call') {
    const tool = params.name;
    const delay = 20 + Math.random() * 60; // 20–80 ms

    setTimeout(() => {
      if (tool === 'write_file' && Math.random() < 0.2) {
        return res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32001, message: 'PermissionDenied: /data is read-only' },
        });
      }
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `mock result for ${tool}` }],
        },
      });
    }, delay);
  } else {
    res.status(404).end();
  }
});

export function startFilesystemMcp(port = 4010): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(port, () => resolve(server));
  });
}
