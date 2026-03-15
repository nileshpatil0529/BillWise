export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(e => e.message).join(', ');
  }

  // Firebase errors
  if (err.code && err.code.startsWith('auth/')) {
    statusCode = 401;
    message = getFirebaseAuthErrorMessage(err.code);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

const getFirebaseAuthErrorMessage = (code) => {
  const errorMessages = {
    'auth/user-not-found': 'User not found',
    'auth/wrong-password': 'Invalid password',
    'auth/email-already-exists': 'Email already exists',
    'auth/invalid-email': 'Invalid email format',
    'auth/weak-password': 'Password is too weak',
    'auth/too-many-requests': 'Too many requests. Please try again later.'
  };
  return errorMessages[code] || 'Authentication error';
};

export const notFound = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
};

export default { errorHandler, notFound };
