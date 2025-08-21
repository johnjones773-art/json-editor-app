import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { StyleSheet, Text, View, Button, ScrollView, TextInput, Platform, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import Ajv from 'ajv';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const [jsonData, setJsonData] = useState(null);
  const [editData, setEditData] = useState(null);
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);
  const [driverDatabase, setDriverDatabase] = useState({});
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [newDriverFirstName, setNewDriverFirstName] = useState('');
  const [newDriverLastName, setNewDriverLastName] = useState('');
  const [newDriverCategory, setNewDriverCategory] = useState('AM');
  const [jsonSearch, setJsonSearch] = useState('');
  const [driverSearch, setDriverSearch] = useState('');

  // Load driver database on mount
  React.useEffect(() => {
    loadDriverDatabase();
  }, []);

  const loadDriverDatabase = async () => {
    try {
      const stored = await AsyncStorage.getItem('driverDatabase');
      if (stored) {
        setDriverDatabase(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading driver database:', error);
    }
  };

  const updateDriverCategory = async (driverId, category, driver) => {
    if (!driver || !driver.firstName || !driver.lastName) {
      console.error('Invalid driver data');
      return;
    }

    try {
      const displayName = `${driver.firstName} ${driver.lastName}`;
      const newDatabase = { ...driverDatabase };

      if (category === 'PRO') {
        newDatabase[displayName] = {
          category: 'PRO',
          firstName: driver.firstName,
          lastName: driver.lastName,
          raceNumber: driver.raceNumber || ''
        };
      } else {
        delete newDatabase[displayName];
      }

      await AsyncStorage.setItem('driverDatabase', JSON.stringify(newDatabase));
      setDriverDatabase(newDatabase);

      if (editData && editData.entries) {
        const newData = JSON.parse(JSON.stringify(editData));
        newData.entries.forEach(entry => {
          if (entry.drivers) {
            entry.drivers.forEach(d => {
              if (d.firstName === driver.firstName && d.lastName === driver.lastName) {
                d.driverCategory = category === 'PRO' ? 1 : 0;
              }
            });
          }
        });
        setEditData(newData);
        setJsonData(newData);
      }
    } catch (error) {
      console.error('Error updating driver category:', error);
      Alert.alert('Error', 'Failed to update driver category');
    }
  };

  const addDriverToDatabase = async () => {
    if (!newDriverFirstName || !newDriverLastName) {
      Alert.alert('Error', 'Please enter both first and last name');
      return;
    }

    try {
      const driverKey = `${newDriverFirstName}${newDriverLastName}`;
      const newDatabase = {
        ...driverDatabase,
        [driverKey]: newDriverCategory
      };
      await AsyncStorage.setItem('driverDatabase', JSON.stringify(newDatabase));
      setDriverDatabase(newDatabase);
      setNewDriverFirstName('');
      setNewDriverLastName('');
      setNewDriverCategory('AM');
      setShowAddDriver(false);
      Alert.alert('Success', 'Driver added to database');
    } catch (error) {
      console.error('Error adding driver:', error);
      Alert.alert('Error', 'Failed to add driver to database');
    }
  };

  const removeDriverFromDatabase = async (driverKey) => {
    try {
      const newDatabase = { ...driverDatabase };
      delete newDatabase[driverKey];
      await AsyncStorage.setItem('driverDatabase', JSON.stringify(newDatabase));
      setDriverDatabase(newDatabase);
      Alert.alert('Success', 'Driver removed from database');
    } catch (error) {
      console.error('Error removing driver:', error);
      Alert.alert('Error', 'Failed to remove driver from database');
    }
  };

  const handlePickFile = async () => {
    setError('');
    setValidationErrors([]);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const fileAsset = result.assets[0];
      let text = '';
      if (Platform.OS === 'web') {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'application/json';
        fileInput.onchange = e => {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = event => {
            try {
              const json = JSON.parse(event.target.result);
              // Process drivers in the JSON
              // Only set driverCategory to 1 for PRO drivers in database
              if (json.entries && Array.isArray(json.entries)) {
                json.entries = json.entries.map(entry => {
                  if (entry.drivers && Array.isArray(entry.drivers)) {
                    entry.drivers = entry.drivers.map(driver => {
                      const driverKey = driver.playerID || `${driver.firstName}${driver.lastName}`;
                      // Only modify if driver is in database and marked as PRO
                      if (driverDatabase[driverKey] === 'PRO') {
                        driver.driverCategory = 1;
                      }
                      return driver;
                    });
                  }
                  return entry;
                });
              }
              setJsonData(json);
              setEditData(json);
            } catch (e) {
              setError('Failed to load JSON: ' + e.message);
            }
          };
          reader.readAsText(file);
        };
        fileInput.click();
        return;
      }

      const fileUri = fileAsset.uri;
      const response = await fetch(fileUri);
      text = await response.text();
      const json = JSON.parse(text);
      // Process drivers in the JSON
      if (json.entries && Array.isArray(json.entries)) {
        json.entries = json.entries.map(entry => {
          if (entry.drivers && Array.isArray(entry.drivers)) {
            entry.drivers = entry.drivers.map(driver => {
              const driverKey = driver.playerID || `${driver.firstName}${driver.lastName}`;
              if (driverDatabase[driverKey]) {
                driver.driverCategory = driverDatabase[driverKey] === 'PRO' ? 1 : 0;
              }
              return driver;
            });
          }
          return entry;
        });
      }
      setJsonData(json);
      setEditData(json);
    } catch (e) {
      setError('Failed to load JSON: ' + e.message);
    }
  };

  const handleExportJson = async () => {
    try {
      const jsonString = JSON.stringify(editData, null, 2);
      if (Platform.OS === 'web') {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'edited.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const fileUri = FileSystem.cacheDirectory + 'edited.json';
        await FileSystem.writeAsStringAsync(fileUri, jsonString, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        } else {
          Alert.alert('Exported', 'File saved to: ' + fileUri);
        }
      }
    } catch (e) {
      setError('Failed to export JSON: ' + e.message);
    }
  };

  // Recursively render fields for nested objects/arrays
  const renderJsonFields = (data, path = []) => {
    if (Array.isArray(data)) {
      return data.map((item, idx) => (
        <View key={idx} style={styles.nestedBox}>
          <Text style={styles.arrayIndex}>[{idx}]</Text>
          {renderJsonFields(item, [...path, idx])}
        </View>
      ));
    } else if (data && typeof data === 'object') {
      return Object.entries(data).map(([key, value]) => (
        <View key={key} style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>{key}:</Text>
          {typeof value === 'object' && value !== null ? (
            <View style={styles.nestedBox}>{renderJsonFields(value, [...path, key])}</View>
          ) : (
            <TextInput
              style={styles.input}
              value={String(value)}
              onChangeText={text => handleNestedInputChange([...path, key], text)}
            />
          )}
        </View>
      ));
    }
    return null;
  };

  const handleNestedInputChange = (path, value) => {
    setEditData(prev => {
      const newData = JSON.parse(JSON.stringify(prev));
      let obj = newData;
      for (let i = 0; i < path.length - 1; i++) {
        obj = obj[path[i]];
      }
      obj[path[path.length - 1]] = value;
      return newData;
    });
  };

  // Search function to highlight PRO drivers in the database
  // Search function for the driver database
  const searchDatabase = (searchText) => {
    if (!searchText) return Object.entries(driverDatabase);
    const searchLower = searchText.toLowerCase();
    return Object.entries(driverDatabase).filter(([key, value]) => {
      const fullName = `${value.firstName} ${value.lastName}`.toLowerCase();
      return fullName.includes(searchLower);
    });
  };

  // Function to find and highlight all driver information in the JSON content
  const highlightDriverSearch = (data, path = []) => {
    if (!data) return data;
    
    if (Array.isArray(data)) {
      return data.map((item, idx) => highlightDriverSearch(item, [...path, idx]));
    } else if (typeof data === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(data)) {
        // If this is a driver object, include all its info when the name matches
        if (key === 'drivers' && Array.isArray(value)) {
          result[key] = value.map(driver => {
            const fullName = `${driver.firstName} ${driver.lastName}`.toLowerCase();
            if (!jsonSearch || fullName.includes(jsonSearch.toLowerCase())) {
              // Highlight the matching name parts
              const highlightedDriver = { ...driver };
              if (jsonSearch) {
                const searchLower = jsonSearch.toLowerCase();
                if (driver.firstName.toLowerCase().includes(searchLower)) {
                  highlightedDriver.firstName = `***${driver.firstName}***`;
                }
                if (driver.lastName.toLowerCase().includes(searchLower)) {
                  highlightedDriver.lastName = `***${driver.lastName}***`;
                }
              }
              return highlightedDriver;
            }
            return null;
          }).filter(Boolean); // Remove null entries
        } else if (typeof value === 'object' && value !== null) {
          const nested = highlightDriverSearch(value, [...path, key]);
          if (Object.keys(nested).length > 0) {
            result[key] = nested;
          }
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    return data;
  };

  // Filter drivers based on search
  const filterDrivers = () => {
    if (!driverSearch) return Object.entries(driverDatabase);
    
    const searchLower = driverSearch.toLowerCase();
    return Object.entries(driverDatabase).filter(([key]) => 
      key.toLowerCase().includes(searchLower)
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>JSON Editor App</Text>
      
      {/* Top Action Buttons */}
      <View style={styles.actionButtons}>
        <Button title="Upload JSON File" onPress={handlePickFile} />
        <View style={{width: 10}} />
        {editData && <Button title="Export JSON" onPress={handleExportJson} />}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      
      {/* Main Content Area */}
      <View style={styles.mainContent}>
        {/* Left Column - JSON Content */}
        <View style={styles.jsonSection}>
          <Text style={styles.sectionTitle}>JSON Content</Text>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search for driver..."
              value={jsonSearch}
              onChangeText={setJsonSearch}
            />
          </View>
          <ScrollView style={styles.jsonScroll}>
            {editData && renderJsonFields(jsonSearch ? highlightDriverSearch(editData) : editData)}
          </ScrollView>
        </View>

        {/* Right Column - Driver Management */}
        <View style={styles.driverSection}>
          {/* Stored Driver Database */}
          <View style={styles.databasePanel}>
            <View style={styles.panelHeader}>
              <Text style={styles.sectionTitle}>Driver Database</Text>
              <Button 
                title={showAddDriver ? "Cancel" : "Add Driver"}
                onPress={() => setShowAddDriver(!showAddDriver)}
              />
            </View>

            <View style={styles.searchBox}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search drivers..."
                value={driverSearch}
                onChangeText={setDriverSearch}
              />
            </View>

            {showAddDriver && (
              <View style={styles.addDriverForm}>
                <TextInput
                  style={styles.driverInput}
                  placeholder="First Name"
                  value={newDriverFirstName}
                  onChangeText={setNewDriverFirstName}
                />
                <TextInput
                  style={styles.driverInput}
                  placeholder="Last Name"
                  value={newDriverLastName}
                  onChangeText={setNewDriverLastName}
                />
                <View style={styles.categoryButtons}>
                  <Button
                    title="PRO"
                    onPress={() => setNewDriverCategory('PRO')}
                    color={newDriverCategory === 'PRO' ? '#4CAF50' : undefined}
                  />
                  <View style={{width: 10}} />
                  <Button
                    title="AM"
                    onPress={() => setNewDriverCategory('AM')}
                    color={newDriverCategory === 'AM' ? '#2196F3' : undefined}
                  />
                </View>
                <Button title="Save Driver" onPress={addDriverToDatabase} />
              </View>
            )}

            <ScrollView style={styles.driverList}>
              {filterDrivers().map(([key, driverInfo]) => (
                <View key={key} style={styles.driverItem}>
                  <Text style={styles.driverName}>
                    {`${driverInfo.firstName} ${driverInfo.lastName}${driverInfo.raceNumber ? ` #${driverInfo.raceNumber}` : ''}`}
                  </Text>
                  <View style={styles.driverActions}>
                    <Text style={driverInfo.category === 'PRO' ? styles.proBadge : styles.amBadge}>
                      {driverInfo.category}
                    </Text>
                    <View style={{width: 10}} />
                    <Button 
                      title="Remove"
                      onPress={() => removeDriverFromDatabase(key)}
                      color="#ff4444"
                    />
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Current File Drivers */}
          {editData && editData.entries && (
            <View style={styles.currentDriversPanel}>
              <Text style={styles.sectionTitle}>Current File Drivers</Text>
              <ScrollView style={styles.driverList}>
                {editData.entries.map((entry, index) =>
                  entry.drivers && entry.drivers.map((driver, dIndex) => {
                    const driverId = driver.playerID || `${driver.firstName}${driver.lastName}`;
                    const category = driver.driverCategory === 1 ? 'PRO' : 
                                   driver.driverCategory === 0 ? 'AM' : 'Unset';
                    
                    return (
                      <View key={`${index}-${dIndex}`} style={styles.driverItem}>
                        <Text style={styles.driverName}>
                          {driver.firstName} {driver.lastName}
                        </Text>
                        <View style={styles.driverActions}>
                          <Button 
                            title="PRO"
                            onPress={() => updateDriverCategory(driverId, 'PRO', driver)}
                            color={category === 'PRO' ? '#4CAF50' : undefined}
                          />
                          <View style={{width: 10}} />
                          <Button 
                            title="AM"
                            onPress={() => updateDriverCategory(driverId, 'AM', driver)}
                            color={category === 'AM' ? '#2196F3' : undefined}
                          />
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  searchBox: {
    marginBottom: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
    fontSize: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    gap: 20,
  },
  jsonSection: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 16,
    marginRight: 20,
  },
  driverSection: {
    width: '35%',
    minWidth: 300,
    gap: 20,
  },
  databasePanel: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 16,
  },
  currentDriversPanel: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addDriverForm: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    gap: 10,
  },
  driverInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  driverList: {
    flex: 1,
  },
  driverItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  driverName: {
    fontSize: 16,
    flex: 1,
  },
  driverActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  proBadge: {
    backgroundColor: '#4CAF50',
    color: 'white',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    minWidth: 40,
    textAlign: 'center',
  },
  amBadge: {
    backgroundColor: '#2196F3',
    color: 'white',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    minWidth: 40,
    textAlign: 'center',
  },
  jsonScroll: {
    flex: 1,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    minWidth: 100,
    fontWeight: '500',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
  },
  nestedBox: {
    marginLeft: 20,
    borderLeftWidth: 2,
    borderLeftColor: '#eee',
    paddingLeft: 10,
  },
  error: {
    color: 'red',
    marginBottom: 10,
  },
});
