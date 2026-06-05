export async function retry429(fn, maxAttempts = 8) {
  let delay = 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 =
        err?.status === 429 ||
        err?.response?.status === 429 ||
        (err?.message || '').toLowerCase().includes('rate limit');

      if (!is429 || attempt === maxAttempts) {
        throw err;
      }

      console.warn('429 detected', { attempt, delay });
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}