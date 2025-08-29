const express = require('express');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const multer = require('multer');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Veritabanı bağlantısı
const db = new sqlite3.Database('./database.db');

// Kullanıcı tablosu oluşturma
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

  // Admin kullanıcısını oluştur (şifre: Helin2121)
  const adminEmail = 'barisha@yaani.com';
  const adminPassword = bcrypt.hashSync('Helin2121', 10);
  
  db.get('SELECT * FROM users WHERE email = ?', [adminEmail], (err, row) => {
    if (!row) {
      db.run('INSERT INTO users (email, password) VALUES (?, ?)', [adminEmail, adminPassword]);
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
    const userPath = req.user.email === 'barisha@yaani.com' ? 'admin' : `users/${req.user.id}`;
    const dir = `public/uploads/${userPath}`;
    
    const fs = require('fs');
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

app.post('/login', passport.authenticate('local', {
  successRedirect: '/dashboard',
  failureRedirect: '/login',
  failureFlash: false
}));

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

app.post('/register', (req, res) => {
  const { email, password } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);
  
  db.run('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword], function(err) {
    if (err) {
      return res.status(500).send('Bu email zaten kayıtlı.');
    }
    res.redirect('/login');
  });
});

app.get('/dashboard', isAuthenticated, (req, res) => {
  if (req.user.email === 'barisha@yaani.com') {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
  } else {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
  }
});

app.post('/upload', isAuthenticated, upload.array('files', 100), (req, res) => {
  const files = req.files;
  const folder = req.body.folder || 'root';
  
  files.forEach(file => {
    db.run(
      'INSERT INTO files (user_id, filename, originalname, path, size, folder) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, file.filename, file.originalname, file.path, file.size, folder]
    );
  });
  
  res.json({ message: `${files.length} dosya başarıyla yüklendi.` });
});

app.get('/files', isAuthenticated, (req, res) => {
  if (req.user.email === 'barisha@yaani.com') {
    // Admin tüm dosyaları görür
    db.all('SELECT files.*, users.email as user_email FROM files JOIN users ON files.user_id = users.id', (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    });
  } else {
    // Normal kullanıcı sadece kendi dosyalarını görür
    db.all('SELECT * FROM files WHERE user_id = ?', [req.user.id], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    });
  }
});

app.delete('/files/:id', isAuthenticated, (req, res) => {
  const fileId = req.params.id;
  
  if (req.user.email === 'barisha@yaani.com') {
    // Admin herhangi bir dosyayı silebilir
    db.get('SELECT * FROM files WHERE id = ?', [fileId], (err, file) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      const fs = require('fs');
      fs.unlink(file.path, (err) => {
        if (err) console.error('Dosya silinirken hata oluştu:', err);
      });
      
      db.run('DELETE FROM files WHERE id = ?', [fileId], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Dosya silindi.' });
      });
    });
  } else {
    res.status(403).json({ error: 'Yetkiniz yok.' });
  }
});

app.post('/create-folder', isAuthenticated, (req, res) => {
  // Klasörler veritabanında saklanacak
  const { folderName } = req.body;
  res.json({ message: `"${folderName}" klasörü oluşturuldu.` });
});

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/login');
});

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor.`);
});
