import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
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
                deadlines: [
                  {
                    course: "CS2305",
                    title: "Homework 1",
                    type: "Homework",
                    due_date: "2026-02-01",
                    points: 100,
                    weight: 2.27
                  },
                  {
                    course: "CS2305",
                    title: "Midterm Exam",
                    type: "Exam",
                    due_date: "2026-03-10",
                    points: 100,
                    weight: 30.0
                  },
                  {
                    course: "HIST 1301",
                    title: "Reading Quiz",
                    type: "Quiz",
                    due_date: "2026-03-15",
                    points: 50,
                    weight: 5.0
                  }
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
