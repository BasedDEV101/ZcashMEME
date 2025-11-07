# Test Suite for Zcash Meme Coin CLI Tool

Comprehensive test suite for ZIP 227 Zcash Shielded Assets implementation.

## Test Structure

### Unit Tests

1. **keys.test.js** - Key Generation Tests
   - Seed generation
   - Master key generation
   - Key derivation
   - Issuer identifier encoding
   - Key storage and loading

2. **crypto.test.js** - Cryptographic Utilities Tests
   - BLAKE2b hashing (256 and 512 bit)
   - Asset description hash computation
   - Asset ID calculation
   - Asset digest and base computation
   - Asset description formatting and parsing

3. **issuance.test.js** - Issuance Transaction Tests
   - Asset description creation
   - Issue action building
   - Issuance bundle construction
   - Transaction signing
   - Complete transaction building

4. **token-creator.test.js** - Token Creator Tests
   - Token creation
   - Token validation
   - Issue more tokens
   - Token finalization
   - Token status updates
   - Token deployment

### Integration Tests

5. **integration.test.js** - End-to-End Tests
   - Complete token creation flow
   - Multiple token creation
   - Token lifecycle (create, issue, finalize)
   - Data consistency
   - Large supply handling
   - Various description formats

## Running Tests

### Run All Tests
```bash
npm run test:unit
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Specific Test File
```bash
npm run test:unit -- tests/crypto.test.js
```

## Test Coverage

The test suite covers:

- [OK] Key generation (ZIP 227)
- [OK] Cryptographic operations
- [OK] Asset ID calculation
- [OK] Issuance transaction building
- [OK] Token creation and management
- [OK] Token finalization
- [OK] Error handling
- [OK] Edge cases
- [OK] Integration scenarios

## Test Results

All tests should pass with:
- 5 test suites
- 57+ tests
- 100% coverage of core functionality

## Test Data

Test data is stored in:
- `test-tokens/` - Test token storage (gitignored)
- `test-keys/` - Test key storage (gitignored)

These directories are automatically cleaned up after tests.

## Writing New Tests

When adding new functionality:

1. Add unit tests for the new module
2. Add integration tests if it affects multiple components
3. Ensure test coverage remains high
4. Update this README with new test information

## Notes

- Tests use Jest with ES modules support
- Test directories are automatically created and cleaned
- All tests are isolated and don't affect production data
