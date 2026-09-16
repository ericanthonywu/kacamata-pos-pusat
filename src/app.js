require('dotenv').config();
const express = require('express');
const path = require('path');
const flash = require('connect-flash');

const db = require('./config/database');
const { todayStr } = require('./utils/date.helper');
const sessionMiddleware = require('./config/session');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes/index.routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(sessionMiddleware);
app.use(flash());

// Global template vars & Dynamic Base Path / Redirection
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();

  // If accessed directly via server public IP, redirect to HTTPS domain with /pontianak prefix
  if (host.includes('187.77.121.132')) {
    const targetPath = req.originalUrl || req.url || '/';
    const cleanPath = targetPath.startsWith('/pontianak')
      ? targetPath
      : ('/pontianak' + (targetPath === '/' ? '/' : (targetPath.startsWith('/') ? targetPath : '/' + targetPath)));
    return res.redirect(301, 'https://srv1743851.hstgr.cloud' + cleanPath);
  }

  const isLocal = host.includes('localhost') ||
                  host.includes('127.0.0.1') ||
                  host.startsWith('192.168.') ||
                  host.startsWith('10.') ||
                  host.startsWith('172.');

  let prefix = '';
  if (!isLocal) {
    prefix = req.headers['x-forwarded-prefix'] || process.env.APP_PREFIX || '';
  }

  if (prefix) {
    if (!prefix.startsWith('/')) prefix = '/' + prefix;
    if (prefix.endsWith('/')) prefix = prefix.slice(0, -1);
  } else {
    prefix = '';
  }

  req.basePath = prefix;
  res.locals.basePath = prefix;

  res.locals.appUrl = (p) => {
    if (!p) return prefix || '/';
    if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('//')) return p;
    if (!p.startsWith('/')) p = '/' + p;
    if (prefix && (p === prefix || p.startsWith(prefix + '/'))) return p;
    return prefix + p;
  };

  const origRedirect = res.redirect.bind(res);
  res.redirect = function (first, second) {
    let status = 302;
    let url = first;
    if (typeof first === 'number') {
      status = first;
      url = second;
    }
    if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
      if (req.basePath && !url.startsWith(req.basePath + '/') && url !== req.basePath) {
        url = req.basePath + url;
      }
    }
    return origRedirect(status, url);
  };

  res.locals.currentUser = req.session.user || null;
  res.locals.success = req.flash('success')[0] || null;
  res.locals.error = req.flash('error')[0] || null;
  res.locals.todayStr = todayStr;
  next();
});

// Routes
app.use('/', routes);

// Error handler
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`\n🚀 OPTIK SENTRAL PONTIANAK running on http://localhost:${PORT}`);
});

// Graceful Shutdown
function gracefulShutdown(signal) {
  console.log(`\n${signal} signal received: closing HTTP server`);
  server.close(() => {
    console.log('HTTP server closed');
    db.destroy().then(() => {
      console.log('Database connections closed');
      process.exit(0);
    }).catch((err) => {
      console.error('Error closing database connections:', err);
      process.exit(1);
    });
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// For nodemon restarts
process.once('SIGUSR2', () => {
  server.close(() => {
    db.destroy().then(() => {
      process.kill(process.pid, 'SIGUSR2');
    });
  });
});
