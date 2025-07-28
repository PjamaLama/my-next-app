"use client";
import React, { useState, useEffect } from 'react';
import { useSheet } from '../providers/SheetProvider';

const SheetSelector: React.FC = () => {
  const { defaultSpreadsheetId, selectedSheetNames, setSelectedSheetNames } = useSheet();
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          if (data.sheetNames.length > 0 && selectedSheetNames.length === 0) {
            setSelectedSheetNames([data.sheetNames[0]]);
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
  }, [defaultSpreadsheetId, selectedSheetNames, setSelectedSheetNames]);

  const handleSheetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSheetNames([event.target.value]);
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

  return (
    <div className="flex items-center space-x-2">
      <label htmlFor="sheet-selector" className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Active Sheet:
      </label>
      <select
        id="sheet-selector"
        value={selectedSheetNames[0] || ''}
        onChange={handleSheetChange}
        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
      >
        {sheetNames.map(name => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default SheetSelector;
