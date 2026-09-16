// Petits médias valides pour les tests (décodables par <img>/<canvas>).
// PNG 2×2 rouge, 69 octets.
export const PNG_2x2_RED = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVQIW2P8z8DwnwEKGGEMAD1EBP8kU7aFAAAAAElFTkSuQmCC',
  'base64',
);

export const photoFile = (name = 'photo.png') => ({ name, mimeType: 'image/png', buffer: PNG_2x2_RED });
