const express = require('express');
const router = express.Router();
const User = require('../models/User');
const License = require('../models/License');
const isAuthenticated = require('../middleware/auth');

router.get('/', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.render('login');
    }
    res.redirect('/dashboard');
});

  router.get('/dashboard', isAuthenticated, async (req, res) => {
      try {
          const activeLicenses = await License.countDocuments({ status: 'Active' });
          const totalUsers = await User.countDocuments();
          const recentActivities = await License.find()
              .populate('userId')
              .sort({ createdAt: -1 })
              .limit(5);

          res.render('dashboard', {
              path: '/dashboard',
              user: req.user,
              activeLicenses,
              totalUsers,
              activities: recentActivities
          });
      } catch (err) {
          console.error(err);
          res.status(500).send('Server Error');
      }
  });

  router.get('/licenses', isAuthenticated, async (req, res) => {
      try {
          const licenses = await License.find()
              .populate('userId')
              .sort({ createdAt: -1 });

          res.render('licenses', {
              path: '/licenses',
              user: req.user,
              licenses
          });
      } catch (err) {
          console.error(err);
          res.status(500).send('Server Error');
      }
  });

  router.get('/users', isAuthenticated, async (req, res) => {
      try {
          const users = await User.find().sort({ joinDate: -1 });
        
          res.render('users', {
              path: '/users',
              user: req.user,
              users
          });
      } catch (err) {
          console.error(err);
          res.status(500).send('Server Error');
      }
  });


module.exports = router;
