import React, { useState } from "react";
import { View, TextInput, Text, StyleSheet, Animated } from "react-native";

const CustomTextInput = React.forwardRef((props, ref) => {
  const {
    containerStyle,
    inputStyle,
    textInputProps = {},
    placeholder = "Custom Input",
    label,
    error,
    icon,
    ...directProps
  } = props;

  const [isFocused, setIsFocused] = useState(false);
  const [borderAnim] = useState(new Animated.Value(0));

  const handleFocus = () => {
    setIsFocused(true);
    Animated.timing(borderAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    Animated.timing(borderAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const borderColor = borderAnim.interpolate({
    inputRange: [0, 1],
    outputRange: error ? ["#EF4444", "#EF4444"] : ["#E0E0E0", "#6FCF97"],
  });

  // Merge textInputProps with direct props; direct props take precedence
  const mergedProps = {
    placeholder,
    placeholderTextColor: "#9CA3AF",
    ...textInputProps,
    ...directProps,
    onFocus: (e) => {
      handleFocus();
      directProps.onFocus?.(e);
    },
    onBlur: (e) => {
      handleBlur();
      directProps.onBlur?.(e);
    },
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={[styles.label, isFocused && styles.labelFocused]}>
          {label}
        </Text>
      )}
      <Animated.View
        style={[
          styles.inputWrapper,
          error && styles.inputWrapperError,
          { borderColor },
        ]}
      >
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <TextInput
          ref={ref}
          style={[styles.input, icon && styles.inputWithIcon, inputStyle]}
          {...mergedProps}
        />
      </Animated.View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 8,
    transition: "color 0.2s",
  },
  labelFocused: {
    color: "#6FCF97",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E0E0E0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  inputWrapperError: {
    borderColor: "#EF4444",
  },
  iconContainer: {
    paddingLeft: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    flex: 1,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#1F2937",
    fontWeight: "400",
  },
  inputWithIcon: {
    paddingLeft: 8,
  },
  errorText: {
    fontSize: 12,
    color: "#EF4444",
    marginTop: 6,
    marginLeft: 4,
  },
});

export default CustomTextInput;
