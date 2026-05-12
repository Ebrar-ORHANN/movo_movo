import { StyleSheet, Text, TextInput, Pressable, View } from 'react-native'
import React, {useState} from 'react';


export default function PromptInput({
    value,
    onChange,
    onSubmit,
    loading = false,
    }) {
    
  return (
    <View style ={styles.container}>
      <TextInput
        placeholder='Sakin bir yürüyüş rotası'
        placeholderTextColor='#888'
        style ={styles.input}
        returnKeyType="search"
        value={value}
        onChangeText={onChange}
        editable={!loading}
        onSubmitEditing={onSubmit}
      />
      <Pressable 
      style = {[styles.button, loading && styles.buttonDisabled]}
      onPress = {onSubmit}
      disabled = {loading}
      >
      <Text style={styles.buttonText}>{loading ? "Aranıyor.." : "Ara"}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
    container: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  input: {
    color: "#FFF",
    fontSize: 16,
  },
  button: {
    backgroundColor: "#4CAF50",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#000",
    fontWeight: "600",
    fontSize: 16,
  },

    

})