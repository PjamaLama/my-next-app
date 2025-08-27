# Selected Sheets Migration Guide

## Overview

This migration moves `selectedSheetNames` and `defaultSpreadsheetId` from the private profile document (`users/{uid}/private/profile`) to the main user document (`users/{uid}`) for better performance and consistency with the existing denormalization pattern used for `message_count` and `last_reset`.

## Migration Details

### What Changes
- **Before**: Sheet selections stored in `users/{uid}/private/profile`
- **After**: Sheet selections stored in `users/{uid}` (main document)
- **Data Moved**:
  - `selectedSheetNames` (array of strings)
  - `defaultSpreadsheetId` (string)

### Benefits
1. **Performance**: Faster queries (no subcollection access needed)
2. **Consistency**: Follows existing denormalization pattern
3. **Security**: Non-sensitive sheet selection data doesn't need private profile access
4. **Simplicity**: Easier to manage and query

## Migration Steps

### 1. Pre-Migration Testing
```bash
# Test the migration setup
npm run test:migration
```

### 2. Create Backup (Recommended)
```bash
# Backup existing data before migration
npm run migrate:selected-sheets:backup
```

### 3. Run Migration
```bash
# Migrate data from private profile to main user document
npm run migrate:selected-sheets
```

### 4. Verify Migration
- Test sheet selection in the application
- Verify data integrity
- Check that existing users' sheet selections are preserved

### 5. Rollback (if needed)
```bash
# Restore data from backup if issues arise
npm run migrate:selected-sheets:restore
```

## Files Modified

### Core Application Changes
- **`app/providers/SheetProvider.tsx`**: Updated to read/write from main user document
- **`app/providers/FirebaseProvider.tsx`**: Added initialization of new fields
- **`pages/api/user/export-data.ts`**: Updated to export from main user document

### Migration Scripts
- **`scripts/migrate-selected-sheets.ts`**: Main migration script with backup/restore
- **`scripts/test-migration.ts`**: Validation tests
- **`package.json`**: Added npm scripts for migration

## Data Flow After Migration

1. **User selects sheets** in `SheetChipSelector`
2. **`setSelectedSheetNames`** called in `SheetProvider`
3. **`saveDefaultSelections`** saves to main user document (`users/{uid}`)
4. **`SheetProvider`** listens for changes on main user document
5. **All components** use data from `SheetProvider` (no changes needed)

## Rollback Plan

If issues arise after migration:

1. **Immediate rollback**: `npm run migrate:selected-sheets:restore`
2. **Code rollback**: Revert changes to SheetProvider and FirebaseProvider
3. **Data verification**: Ensure all user data is intact

## Testing Checklist

- [ ] Sheet selection UI works correctly
- [ ] Selected sheets persist across sessions
- [ ] Default spreadsheet ID is preserved
- [ ] Export functionality includes sheet selections
- [ ] No data loss occurred during migration
- [ ] Performance is improved (fewer subcollection queries)

## Technical Details

### Database Structure Changes

**Before Migration:**
```
users/{uid}/private/profile: {
  selectedSheetNames: ["Sheet1", "Sheet2"],
  defaultSpreadsheetId: "spreadsheet123",
  // ... other private data
}
```

**After Migration:**
```
users/{uid}: {
  selectedSheetNames: ["Sheet1", "Sheet2"],
  defaultSpreadsheetId: "spreadsheet123",
  message_count: 5,           // existing denormalized field
  last_reset: timestamp,      // existing denormalized field
  // ... other user data
}

users/{uid}/private/profile: {
  geminiApiKey: "...",        // only sensitive data remains
  betaTester: true,
  // ... other private data (selectedSheetNames removed)
}
```

### Error Handling

The migration script includes comprehensive error handling:
- Validates data before migration
- Creates backups before making changes
- Provides detailed logging
- Handles partial failures gracefully
- Supports complete rollback

### Performance Impact

**Before**: Each sheet selection required reading from subcollection
**After**: Sheet selections read from main document (faster queries)

**Before**: Sheet saves required subcollection writes
**After**: Sheet saves use main document writes (simpler operations)

## Security Considerations

- Sheet selection data is not sensitive (contains only sheet names and spreadsheet IDs)
- Moving to main document improves performance without security risks
- Private profile still contains sensitive data (API keys, beta flags)

## Monitoring

After migration, monitor:
- Application performance (should improve)
- Error rates (should not increase)
- User reports of missing sheet selections
- Database query performance

## Support

If issues arise:
1. Check migration logs for errors
2. Verify backup data integrity
3. Use rollback script if needed
4. Contact development team with error details
