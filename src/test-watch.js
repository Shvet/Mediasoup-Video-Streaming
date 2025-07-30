// This file is used to test nodemon's file watching capability
// When you modify this file, nodemon should automatically restart the server

console.log('Nodemon watch test file loaded at:', new Date().toISOString());
console.log('This line was added to demonstrate automatic server restart!');
console.log('Second change to verify nodemon is consistently watching for changes.');

// Export a simple function that can be imported in other files if needed
module.exports = {
  testFunction: () => {
    return 'This is a test function';
  }
};