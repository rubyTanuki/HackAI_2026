import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5173,
    strictPort: false,
  },
  plugins: [
    react(),
    {
      name: 'mock-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/upload-syllabus' && req.method === 'POST') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ 
              message: 'Success! Mock syllabus received on localhost.',
              events: [
                { id: '1', course: 'CS 1337', type: 'Homework', title: 'Array Practice', date: '2026-03-20', status: 'Not started' },
                { id: '2', course: 'CS 1337', type: 'Exam', title: 'Midterm 1', date: '2026-03-25', status: 'Not started' },
                { id: '3', course: 'MATH 2414', type: 'Quiz', title: 'Integration', date: '2026-03-22', status: 'In progress' }
              ]
            }));
            return;
          }
          next();
        });
      }
    }
  ],
  optimizeDeps: {
    exclude: ['pdfjs-dist']
  }
})
