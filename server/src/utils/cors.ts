const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',');
const corsOptions = {
  origin: function (origin: string, callback: Function) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, { origin: true });

    if (allowedOrigins?.indexOf(origin) !== -1) {
      callback(null, { origin: true });
    } else {
      callback(new Error('Not allowed by CORS'), { origin: false });
    }
  },
  optionsSuccessStatus: 200,
};
export default corsOptions;
