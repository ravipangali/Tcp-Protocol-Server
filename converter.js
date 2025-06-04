function hexToBinary(hex) {
  // Remove optional "0x" prefix if present
  hex = hex.replace(/^0x/, '');

  return hex
    .split('')
    .map(char => parseInt(char, 16).toString(2).padStart(4, '0')) // Convert each hex digit to 4-bit binary
    .join('');
}