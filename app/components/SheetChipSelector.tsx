"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useSheet } from '../providers/SheetProvider';

const SheetChipSelector: React.FC = () => {
  const { defaultSpreadsheetId, selectedSheetNames, setSelectedSheetNames } = useSheet();
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedSheetNamesRef = useRef(selectedSheetNames);
  const setSelectedSheetNamesRef = useRef(setSelectedSheetNames);

  // Update refs when values change
  useEffect(() => {
    selectedSheetNamesRef.current = selectedSheetNames;
  }, [selectedSheetNames]);

  useEffect(() => {
    setSelectedSheetNamesRef.current = setSelectedSheetNames;
  }, [setSelectedSheetNames]);

  useEffect(() => {
    if (defaultSpreadsheetId) {
      setIsLoading(true);
      setError(null);
      fetch(`/api/get-sheet-names?spreadsheetId=${defaultSpreadsheetId}`)
        .then(res => {
          if (!res.ok) {
            throw new Error('Failed to fetch sheet names');
          }
          return res.json();
        })
        .then(data => {
          setSheetNames(data.sheetNames);
          // Only set default selection if no sheets are currently selected
          if (data.sheetNames.length > 0 && selectedSheetNamesRef.current.length === 0) {
            setSelectedSheetNamesRef.current([data.sheetNames[0]]);
          }
        })
        .catch(err => {
          setError(err.message);
          console.error(err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [defaultSpreadsheetId]); // Only depend on defaultSpreadsheetId

  const toggleSheetSelection = (sheetName: string) => {
    console.log('=== Toggle Sheet Selection ===');
    console.log('Sheet name:', sheetName);
    console.log('Current selectedSheetNames:', selectedSheetNames);
    console.log('Is currently selected:', selectedSheetNames.includes(sheetName));
    
    const newSelected = selectedSheetNames.includes(sheetName)
      ? selectedSheetNames.filter(name => name !== sheetName)
      : [...selectedSheetNames, sheetName];
    
    console.log('New selectedSheetNames:', newSelected);
    setSelectedSheetNames(newSelected);
  };

  if (!defaultSpreadsheetId) {
    return null;
  }

  if (isLoading) {
    return <div>Loading sheets...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }



  console.log('=== Render Debug ===');
  console.log('sheetNames:', sheetNames);
  console.log('selectedSheetNames:', selectedSheetNames);
  console.log('isLoading:', isLoading);
  console.log('error:', error);

  return (
    <div className="flex flex-wrap gap-2">
      {sheetNames.map(name => (
        <button
          key={name}
          onClick={() => toggleSheetSelection(name)}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            selectedSheetNames.includes(name)
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {name}
        </button>
      ))}
    </div>
  );
};

export default SheetChipSelector;
