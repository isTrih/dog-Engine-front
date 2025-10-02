'use client';

import { useState, useEffect } from 'react';

// Custom hook for interacting with localStorage
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState<T>(() => {
    // This part now runs only on the initial render
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      // Get from local storage by key
      const item = window.localStorage.getItem(key);
      // Parse stored json or if none return initialValue
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      // If error also return initialValue
      console.log(error);
      return initialValue;
    }
  });

  // useEffect to update local storage when the state changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
        try {
            // Allow value to be a function so we have same API as useState
            const valueToStore = storedValue;
            // Save state to local storage
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) {
            // A more advanced implementation would handle the error case
            console.log(error);
        }
    }
  }, [key, storedValue]);
  
  // We rename setValue to setStoredValue to avoid confusion with the state setter.
  // The user of the hook will call this function.
  const setValue = (value: T | ((val: T) => T)) => {
    setStoredValue(value);
  };


  return [storedValue, setValue];
}
