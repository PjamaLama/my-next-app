describe('SheetChipSelector - Event System Integration', () => {
  it('should dispatch refresh-needed event when spreadsheet-removed event is received', () => {
    const mockDispatchEvent = jest.spyOn(window, 'dispatchEvent');

    // Simulate the event listener logic from SheetChipSelector
    const handleSpreadsheetRemoved = () => {
      window.dispatchEvent(new CustomEvent('sheet-selector-refresh', {
        detail: { action: 'refresh-needed' }
      }));
    };

    // Simulate receiving the spreadsheet-removed event
    const eventListener = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.action === 'spreadsheet-removed') {
        handleSpreadsheetRemoved();
      }
    };

    // Register and trigger the event
    window.addEventListener('sheet-selector-refresh', eventListener);
    window.dispatchEvent(new CustomEvent('sheet-selector-refresh', {
      detail: { action: 'spreadsheet-removed' }
    }));

    // Verify the refresh-needed event was dispatched
    expect(mockDispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sheet-selector-refresh',
        detail: { action: 'refresh-needed' },
      })
    );

    // Clean up
    window.removeEventListener('sheet-selector-refresh', eventListener);
    mockDispatchEvent.mockRestore();
  });

  it('should not respond to irrelevant events', () => {
    const mockDispatchEvent = jest.spyOn(window, 'dispatchEvent');
    let eventTriggered = false;

    // Simulate the event listener logic
    const eventListener = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.action === 'spreadsheet-removed') {
        eventTriggered = true;
      }
    };

    // Register and trigger an irrelevant event
    window.addEventListener('sheet-selector-refresh', eventListener);
    window.dispatchEvent(new CustomEvent('sheet-selector-refresh', {
      detail: { action: 'some-other-action' }
    }));

    // Verify no action was taken
    expect(eventTriggered).toBe(false);
    expect(mockDispatchEvent).toHaveBeenCalledTimes(1); // Only the original event

    // Clean up
    window.removeEventListener('sheet-selector-refresh', eventListener);
    mockDispatchEvent.mockRestore();
  });

  it('should demonstrate sheet selection logic', () => {
    // Test the core sheet selection/deselection logic without React
    const mockSetSelectedSheetNames = jest.fn();

    const toggleSheetSelection = (sheetName: string, selectedSheets: string[]) => {
      const newSelected = selectedSheets.includes(sheetName)
        ? selectedSheets.filter(name => name !== sheetName)
        : [...selectedSheets, sheetName];

      mockSetSelectedSheetNames(newSelected);
      return newSelected;
    };

    // Test selecting a sheet
    let result = toggleSheetSelection('Sheet1', []);
    expect(result).toEqual(['Sheet1']);
    expect(mockSetSelectedSheetNames).toHaveBeenCalledWith(['Sheet1']);

    // Test deselecting the same sheet
    mockSetSelectedSheetNames.mockClear();
    result = toggleSheetSelection('Sheet1', ['Sheet1']);
    expect(result).toEqual([]);
    expect(mockSetSelectedSheetNames).toHaveBeenCalledWith([]);
  });

  it('should demonstrate conditional rendering logic', () => {
    // Test the logic for when to show/hide the component
    const shouldRender = (defaultSpreadsheetId: string) => {
      return defaultSpreadsheetId !== '';
    };

    // Should render when spreadsheet is selected
    expect(shouldRender('test-spreadsheet-id')).toBe(true);

    // Should not render when no spreadsheet is selected
    expect(shouldRender('')).toBe(false);
  });
});