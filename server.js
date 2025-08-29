const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Render.com için SQLite session store
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/sessions.db' 
  : './sessions.db';

// Session configuration
app.use(session({
  store: new SQLiteStore({
    dir: process.env.NODE_ENV === 'production' ? '/tmp' : '.',
    db: 'sessions.db'
  }),
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 saat
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Veritabanı bağlantısı - Render.com için dosya yolu
const appDbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/database.db' 
  : './database.db';

const db = new sqlite3.Database(appDbPath);

// Veritabanı tablolarını oluştur
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    filename TEXT,
    originalname TEXT,
    path TEXT,
    size INTEGER,
    folder TEXT DEFAULT 'root',
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  // Admin kullanıcısını oluştur
  const adminEmail = 'barisha@yaani.com';
  const adminPassword = bcrypt.hashSync('Helin2121', 10);
  
  db.get('SELECT * FROM users WHERE email = ?', [adminEmail], (err, row) => {
    if (err) console.error('Admin kontrol hatası:', err);
    if (!row) {
      db.run('INSERT INTO users (email, password) VALUES (?, ?)', [adminEmail, adminPassword], (err) => {
        if (err) console.error('Admin ekleme hatası:', err);
        else console.log('Admin kullanıcısı oluşturuldu');
      });
    }
  });
});

// Passport konfigürasyonu
passport.use(new LocalStrategy({
  usernameField: 'email'
}, (email, password, done) => {
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) return done(err);
    if (!user) return done(null, false, { message: 'Kullanıcı bulunamadı.' });
    
    if (bcrypt.compareSync(password, user.password)) {
      return done(null, user);
    } else {
      return done(null, false, { message: 'Şifre hatalı.' });
    }
  });
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
    done(err, user);
  });
});

// Dosya yükleme konfigürasyonu
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.user) return cb(new Error('Kullanıcı girişi gerekli'));
    
    const userPath = req.user.email === 'barisha@yaani.com' 
      ? 'admin' 
      : `users/${req.user.id}`;
    const dir = `public/uploads/${userPath}`;
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Route'lar
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.status(401).send(`
        <script>
          alert('Giriş başarısız: ${info.message}');
          window.location.href = '/login';
        </script>
      `);
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      return res.redirect('/dashboard');
    });
  })(req, res, next);
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

app.post('/register', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).send('Email ve şifre gereklidir.');
  }
  
  const hashedPassword = bcrypt.hashSync(password, 10);
  
  db.run('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword], function(err) {
    if (err) {
      console.error('Kayıt hatası:', err);
      return res.status(500).send(`
        <script>
          alert('Bu email zaten kayıtlı!');
          window.location.href = '/register';
        </script>
      `);
    }
    console.log('Yeni kullanıcı kaydedildi:', email);
    res.send(`
      <script>
        alert('Kayıt başarılı! Giriş yapabilirsiniz.');
        window.location.href = '/login';
      </script>
    `);
  });
});

app.get('/dashboard', isAuthenticated, (req, res) => {
  if (req.user.email === 'barisha@yaani.com') {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
  } else {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/login');
  });
});

// Middleware: Kimlik doğrulama kontrolü
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

// Hata yönetimi
app.use((err, req, res, next) => {
  console.error('Hata:', err);
  res.status(500).send('Bir hata oluştu: ' + err.message);
});

app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor.`);
  console.log(`Çalışma ortamı: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Session store: SQLite`);
});
