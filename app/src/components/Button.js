import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

const Button = ({
  title,
  onPress,
  variant = "primary",
  size = "medium",
  disabled = false,
  loading = false,
  style,
  textStyle,
  icon,
}) => {
  const buttonStyles = [
    styles.button,
    styles[variant],
    styles[size],
    disabled && styles.disabled,
    style,
  ];

  const textStyles = [
    styles.text,
    styles[`text_${variant}`],
    styles[`text_${size}`],
    disabled && styles.textDisabled,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? "#FFFFFF" : "#FF8A5B"}
        />
      ) : (
        <>
          {icon && icon}
          <Text style={textStyles}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 50,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  // Variants
  primary: {
    backgroundColor: "#FF8A5B", // orange-cta
    shadowColor: "#FF8A5B",
  },
  secondary: {
    backgroundColor: "#6FCF97", // mint-green
    shadowColor: "#6FCF97",
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#6FCF97",
    shadowOpacity: 0,
    elevation: 0,
  },
  ghost: {
    backgroundColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  // Sizes
  small: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    gap: 6,
  },
  medium: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    gap: 8,
  },
  large: {
    paddingVertical: 16,
    paddingHorizontal: 40,
    gap: 10,
  },
  // Text styles
  text: {
    fontWeight: "600",
  },
  text_primary: {
    color: "#FFFFFF",
  },
  text_secondary: {
    color: "#FFFFFF",
  },
  text_outline: {
    color: "#6FCF97",
  },
  text_ghost: {
    color: "#6FCF97",
  },
  text_small: {
    fontSize: 14,
  },
  text_medium: {
    fontSize: 16,
  },
  text_large: {
    fontSize: 18,
  },
  // Disabled state
  disabled: {
    opacity: 0.5,
  },
  textDisabled: {
    opacity: 0.7,
  },
});

export default Button;
