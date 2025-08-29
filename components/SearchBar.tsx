import React from 'react';
import { View, TextInput, StyleSheet, TextInputProps } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

interface SearchBarProps extends Omit<TextInputProps, 'style' | 'placeholder'> {
  placeholder?: string;
}

export function SearchBar({ placeholder = '상품을 검색해보세요', ...inputProps }: SearchBarProps) {
  return (
    <View style={styles.searchContainer}>
      <Feather name="search" size={18} color="#666" style={styles.searchIcon} />
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#888"
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        {...inputProps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  search: {
    height: 44,
    borderRadius: 22,
    paddingLeft: 40,
    paddingRight: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  searchIcon: {
    position: 'absolute',
    left: 14,
    zIndex: 1,
  },
});



