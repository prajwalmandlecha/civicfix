# Volunteer User Role Implementation Guide

## Overview

This document outlines the implementation strategy for adding a **Volunteer** user role to the CivicFix app. Volunteers have a different experience from Citizens: they fix reported issues instead of reporting new ones.

---

## User Type Comparison

| Feature           | Citizen                                           | Volunteer                            |
| ----------------- | ------------------------------------------------- | ------------------------------------ |
| **Report Issues** | ✅ Yes (IssueUpload screen + tab)                 | ❌ No                                |
| **View Feed**     | ✅ All issues                                     | ✅ Unresolved issues only            |
| **Upload Fix**    | ❌ No                                             | ✅ Yes (from HomeScreen)             |
| **Leaderboard**   | ✅ See all users                                  | ✅ See volunteers only               |
| **Tab Bar**       | Home, Location, IssueUpload, Leaderboard, Profile | Home, Location, Leaderboard, Profile |

---

## Implementation Architecture

### 1. User Context Enhancement

**File:** `src/context/UserContext.js`

The UserContext already fetches user profile data. We need to ensure it exposes the `userType` field for conditional rendering throughout the app.

**Current State:**

```javascript
const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // Contains userType
  // ...
};
```

**What We Need:**

- `profile.userType` will be either `"citizen"` or `"volunteer"`
- Already working, just need to consume it properly

---

### 2. Conditional Navigation (CRITICAL)

**File:** `src/App.js`

The Tab Navigator needs to conditionally render tabs based on user type.

**Current Implementation:**

```javascript
const TabNav = () => (
  <Tab.Navigator>
    <Tab.Screen name="Home" component={HomeScreen} />
    <Tab.Screen name="Location" component={LocationScreen} />
    <Tab.Screen name="IssueUpload" component={IssueUploadScreen} />{" "}
    {/* REMOVE for volunteers */}
    <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
    <Tab.Screen name="Profile" component={ProfileScreen} />
  </Tab.Navigator>
);
```

**New Implementation Strategy:**

```javascript
const TabNav = () => {
  const { profile } = useUserContext();
  const isVolunteer = profile?.userType === 'volunteer';

  return (
    <Tab.Navigator screenOptions={{...}}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Location" component={LocationScreen} />

      {/* Conditional: Only show IssueUpload for Citizens */}
      {!isVolunteer && (
        <Tab.Screen
          name="IssueUpload"
          component={IssueUploadScreen}
          options={{
            headerTitle: "Report Issues",
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="add-circle" size={size} color={"#4285f4"} />
            ),
          }}
        />
      )}

      <Tab.Screen name="Leaderboard" component={LeaderboardScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};
```

**Key Points:**

- Import `useUserContext` at the top
- Wrap tab navigation with conditional rendering
- For volunteers: 4 tabs instead of 5

---

### 3. HomeScreen Modifications for Volunteers

**File:** `src/screens/HomeScreen.js`

Volunteers need an "Upload Fix" button to document their work on issues.

**Current Structure:**

- FlatList of SocialPost components
- Pull to refresh
- Shows all issues

**New Structure for Volunteers:**

```javascript
const HomeScreen = () => {
  const [posts, setPosts] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [showFixUploadModal, setShowFixUploadModal] = useState(false);
  const { profile } = useUserContext();

  const isVolunteer = profile?.userType === 'volunteer';

  // Filter to show only unresolved issues for volunteers
  const getPosts = async () => {
    // ... existing fetch logic
    const issues = await Promise.all(response.data.issues.map(...));

    // NEW: Filter for volunteers
    const filteredIssues = isVolunteer
      ? issues.filter(issue => issue.status !== 'resolved')
      : issues;

    setPosts(filteredIssues);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        renderItem={({ item }) => (
          <View>
            <SocialPost {...item} />

            {/* NEW: Show "Upload Fix" button for volunteers */}
            {isVolunteer && (
              <TouchableOpacity
                style={styles.uploadFixButton}
                onPress={() => {
                  setSelectedIssue(item);
                  setShowFixUploadModal(true);
                }}
              >
                <MaterialIcons name="build" size={20} color="#fff" />
                <Text style={styles.uploadFixText}>Upload Fix</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        // ... rest of FlatList props
      />

      {/* NEW: Fix Upload Modal */}
      {isVolunteer && (
        <FixUploadModal
          visible={showFixUploadModal}
          issue={selectedIssue}
          onClose={() => setShowFixUploadModal(false)}
          onSubmit={handleFixUpload}
        />
      )}
    </View>
  );
};
```

**Upload Fix Button Styles:**

```javascript
uploadFixButton: {
  backgroundColor: '#4CAF50',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 12,
  marginHorizontal: 16,
  marginTop: -8,
  marginBottom: 16,
  borderRadius: 8,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 3,
},
uploadFixText: {
  color: '#fff',
  fontWeight: '600',
  fontSize: 16,
  marginLeft: 8,
},
```

---

### 4. Fix Upload Modal Component (NEW)

**File:** `src/components/FixUploadModal.js`

A modal for volunteers to upload images proving they fixed an issue.

**Implementation:**

```javascript
import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useActionSheet } from "@expo/react-native-action-sheet";

const FixUploadModal = ({ visible, issue, onClose, onSubmit }) => {
  const [images, setImages] = useState([]); // Support multiple images
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const { showActionSheetWithOptions } = useActionSheet();

  const pickImage = async () => {
    const options = ["Take Photo", "Choose from Library", "Cancel"];

    showActionSheetWithOptions({ options }, async (selectedIndex) => {
      if (selectedIndex === 0) {
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
        if (!result.canceled) {
          setImages([...images, result.assets[0].uri]);
        }
      } else if (selectedIndex === 1) {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
          allowsMultipleSelection: true,
        });
        if (!result.canceled) {
          setImages([...images, ...result.assets.map((a) => a.uri)]);
        }
      }
    });
  };

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (images.length === 0) {
      Alert.alert("Error", "Please upload at least one image showing the fix");
      return;
    }

    setUploading(true);
    try {
      await onSubmit({
        issueId: issue.id,
        images,
        notes,
        timestamp: new Date().toISOString(),
      });

      // Reset and close
      setImages([]);
      setNotes("");
      onClose();
      Alert.alert("Success", "Fix uploaded successfully! +50 karma points");
    } catch (error) {
      console.error("Fix upload error:", error);
      Alert.alert("Error", "Failed to upload fix. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (!issue) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Upload Fix</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Issue Info */}
          <View style={styles.issueCard}>
            <Text style={styles.issueLabel}>Fixing Issue:</Text>
            <Text style={styles.issueTypes}>
              {issue.issueTypes?.join(", ") || "Unknown Issue"}
            </Text>
            <Text style={styles.issueLocation}>{issue.location}</Text>
          </View>

          {/* Image Upload Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📷 Before & After Photos</Text>
            <Text style={styles.sectionSubtitle}>
              Upload images showing the fixed issue
            </Text>

            <View style={styles.imageGrid}>
              {images.map((uri, index) => (
                <View key={index} style={styles.imageContainer}>
                  <Image source={{ uri }} style={styles.uploadedImage} />
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeImage(index)}
                  >
                    <MaterialIcons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add More Button */}
              <TouchableOpacity
                style={styles.addImageButton}
                onPress={pickImage}
              >
                <MaterialIcons name="add-a-photo" size={32} color="#4285f4" />
                <Text style={styles.addImageText}>Add Photo</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Notes Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📝 Notes (Optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Describe what you fixed and how..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        {/* Submit Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              images.length === 0 && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={uploading || images.length === 0}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Fix</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  issueCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: "#4285f4",
  },
  issueLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  issueTypes: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 4,
  },
  issueLocation: {
    fontSize: 14,
    color: "#666",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 12,
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  imageContainer: {
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  uploadedImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  removeButton: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  addImageButton: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#4285f4",
    backgroundColor: "#f0f7ff",
    alignItems: "center",
    justifyContent: "center",
  },
  addImageText: {
    fontSize: 11,
    color: "#4285f4",
    fontWeight: "600",
    marginTop: 4,
  },
  notesInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 12,
    fontSize: 14,
    minHeight: 100,
  },
  footer: {
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  submitButton: {
    backgroundColor: "#4CAF50",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  submitButtonDisabled: {
    backgroundColor: "#ccc",
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});

export default FixUploadModal;
```

---

### 5. API Integration for Fix Uploads

**File:** `src/screens/HomeScreen.js` (handler function)

```javascript
const handleFixUpload = async (fixData) => {
  try {
    const formData = new FormData();

    // Append all images
    fixData.images.forEach((imageUri, index) => {
      const ext = imageUri.substring(imageUri.lastIndexOf(".") + 1);
      const type = `image/${ext}`;
      formData.append("files", {
        uri: imageUri,
        name: `fix_${index}_${Date.now()}.${ext}`,
        type: type,
      });
    });

    formData.append("issue_id", fixData.issueId);
    formData.append("notes", fixData.notes);
    formData.append("timestamp", fixData.timestamp);
    formData.append("fixed_by", auth.currentUser.uid);

    const response = await api.post("/submit-fix", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    console.log("Fix upload successful:", response.data);

    // Refresh posts to reflect changes
    await getPosts();

    return response.data;
  } catch (error) {
    console.error("Fix upload error:", error);
    throw error;
  }
};
```

**Backend Endpoint Needed:** `POST /submit-fix`

- Request: multipart/form-data with images, issue_id, notes, timestamp, fixed_by
- Response: Success status, karma points earned, updated issue status

---

### 6. Leaderboard Filtering

**File:** `src/screens/LeaderboardScreen.js`

Currently a placeholder. Needs implementation with user type filtering.

```javascript
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, Image } from "react-native";
import { useUserContext } from "../context/UserContext";
import api from "../services/api";
import Card from "../components/Card";

const LeaderboardScreen = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const { profile } = useUserContext();

  const isVolunteer = profile?.userType === "volunteer";

  useEffect(() => {
    fetchLeaderboard();
  }, [isVolunteer]);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);

      // API call with user type filter
      const response = await api.get("/leaderboard", {
        params: {
          userType: isVolunteer ? "volunteer" : "all",
          limit: 50,
        },
      });

      setLeaderboard(response.data.users);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderLeaderboardItem = ({ item, index }) => (
    <Card style={styles.leaderboardCard}>
      <View style={styles.rankBadge}>
        <Text style={styles.rankText}>#{index + 1}</Text>
      </View>

      <View style={styles.userInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.name?.charAt(0).toUpperCase() || "?"}
          </Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.userType}>
            {item.userType === "volunteer" ? "🔧 Volunteer" : "👤 Citizen"}
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{item.karma}</Text>
          <Text style={styles.statLabel}>Karma</Text>
        </View>
        {isVolunteer && (
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{item.fixesCompleted}</Text>
            <Text style={styles.statLabel}>Fixes</Text>
          </View>
        )}
        {!isVolunteer && (
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{item.issuesReported}</Text>
            <Text style={styles.statLabel}>Reports</Text>
          </View>
        )}
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {isVolunteer
            ? "🔧 Volunteer Leaderboard"
            : "🏆 Community Leaderboard"}
        </Text>
        <Text style={styles.headerSubtitle}>
          {isVolunteer
            ? "Top volunteers by fixes completed"
            : "Top contributors by karma points"}
        </Text>
      </View>

      <FlatList
        data={leaderboard}
        renderItem={renderLeaderboardItem}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    backgroundColor: "#fff",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#333",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  listContent: {
    padding: 16,
  },
  leaderboardCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginBottom: 12,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#4285f4",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rankText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  userInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#6FCF97",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  userType: {
    fontSize: 12,
    color: "#666",
  },
  stats: {
    flexDirection: "row",
    gap: 16,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#4285f4",
  },
  statLabel: {
    fontSize: 11,
    color: "#666",
    marginTop: 2,
  },
});

export default LeaderboardScreen;
```

**Backend Endpoint Needed:** `GET /leaderboard?userType={type}&limit={n}`

- Returns top users filtered by type
- Includes: userId, name, userType, karma, fixesCompleted (for volunteers), issuesReported (for citizens)

---

### 7. Profile Screen Updates

**File:** `src/screens/ProfileScreen.js`

Already partially implemented (lines 86-87 show 'fixer' logic). Needs minor updates.

**Changes Needed:**

```javascript
// Line 86-87: Change 'fixer' to 'volunteer'
<View style={styles.userTypeBadge}>
  <Text style={styles.userTypeText}>
    {userData?.userType === "volunteer" ? "🔧 Volunteer" : "👤 Citizen"}
  </Text>
</View>;

// Line 121-135: Update organization section check
{
  userData?.userType === "volunteer" && (
    <Card style={styles.organizationCard}>
      <Text style={styles.organizationLabel}>Organization</Text>
      <Text style={styles.organizationText}>
        {userData?.organization || "Not set"}
      </Text>
      {/* Optional: Add edit functionality */}
    </Card>
  );
}
```

**Stats Section for Volunteers:**

```javascript
// Around line 138-166: Conditionally render stats based on user type
<View style={styles.section}>
  <Text style={styles.sectionTitle}>📊 Your Impact</Text>
  <View style={styles.statsGrid}>
    <View style={styles.statCardWrapper}>
      <StatCard
        emoji={userData?.userType === "volunteer" ? "🔧" : "📸"}
        number={
          userData?.userType === "volunteer"
            ? stats.fixesCompleted
            : stats.issuesUploaded
        }
        label={
          userData?.userType === "volunteer"
            ? "Fixes Completed"
            : "Issues Reported"
        }
        size="small"
      />
    </View>
    <View style={styles.statCardWrapper}>
      <StatCard
        emoji="✅"
        number={stats.issuesResolved}
        label="Issues Resolved"
        size="small"
      />
    </View>
  </View>
  <View style={styles.statsGridFull}>
    <StatCard
      emoji="🌍"
      number={`${stats.co2Saved}kg`}
      label="CO₂ Saved"
      size="medium"
    />
  </View>
</View>
```

---

## Data Model Changes

### Firestore `users` Collection

```javascript
{
  userId: "string",
  name: "string",
  email: "string",
  userType: "citizen" | "volunteer",  // Already implemented
  organization: "string",  // Optional, for volunteers
  karma: number,
  issuesReported: number,  // For citizens
  fixesCompleted: number,  // For volunteers
  co2Saved: number,
  lastLocation: {
    coords: { latitude, longitude },
    address: "string"
  },
  createdAt: timestamp,
}
```

### New Backend Endpoint: `POST /submit-fix`

```javascript
// Request
{
  files: [Image],  // multipart/form-data
  issue_id: "string",
  notes: "string",
  timestamp: "ISO string",
  fixed_by: "uid",
}

// Response
{
  success: boolean,
  message: "Fix submitted successfully",
  karma_earned: 50,
  issue_status: "resolved",
  fix_id: "string",
}
```

### New Backend Endpoint: `GET /leaderboard`

```javascript
// Query params
{
  userType: "volunteer" | "all",
  limit: number,
}

// Response
{
  users: [
    {
      userId: "string",
      name: "string",
      userType: "citizen" | "volunteer",
      karma: number,
      fixesCompleted: number,  // For volunteers
      issuesReported: number,  // For citizens
    }
  ]
}
```

---

## Implementation Checklist

### Phase 1: Foundation

- [ ] Update `App.js` to conditionally render tabs based on `profile.userType`
- [ ] Add `useUserContext` import and use in `App.js`
- [ ] Test navigation for both user types

### Phase 2: HomeScreen for Volunteers

- [ ] Add conditional rendering in `HomeScreen.js` to filter unresolved issues for volunteers
- [ ] Add "Upload Fix" button to each post for volunteers
- [ ] Add state management for fix upload modal
- [ ] Implement `handleFixUpload` function

### Phase 3: Fix Upload Modal

- [ ] Create `src/components/FixUploadModal.js`
- [ ] Implement image picker with multiple image support
- [ ] Add notes input field
- [ ] Add submit functionality
- [ ] Test modal open/close and form validation

### Phase 4: Backend Integration

- [ ] Backend: Create `POST /submit-fix` endpoint
- [ ] Backend: Update issue status when fix is submitted
- [ ] Backend: Award karma points to volunteer
- [ ] Backend: Store fix images and metadata
- [ ] Frontend: Connect `handleFixUpload` to backend

### Phase 5: Leaderboard

- [ ] Backend: Create `GET /leaderboard` endpoint with filtering
- [ ] Implement `LeaderboardScreen.js` with real data
- [ ] Add user type filtering logic
- [ ] Style leaderboard items with rank badges
- [ ] Test for both user types

### Phase 6: Profile Updates

- [ ] Update Profile badge to show 'volunteer' instead of 'fixer'
- [ ] Add conditional stats display based on user type
- [ ] Add organization field for volunteers
- [ ] Fetch and display volunteer-specific stats from backend

### Phase 7: Testing & Polish

- [ ] Test complete flow for citizen users
- [ ] Test complete flow for volunteer users
- [ ] Verify tab navigation works correctly
- [ ] Test fix upload with multiple images
- [ ] Test leaderboard filtering
- [ ] Handle edge cases (no location, no images, etc.)

---

## Key Architectural Decisions

### 1. Why Conditional Tab Navigation?

- Clean UX: Volunteers never see irrelevant "Report Issues" tab
- Simplifies navigation logic
- No need for permission checks within IssueUploadScreen

### 2. Why Modal for Fix Upload?

- Contextual: Upload fix directly from the issue card
- Better UX: Stay on HomeScreen feed after submission
- Reusable: Can be triggered from multiple places (HomeScreen, Issue Detail)

### 3. Why Filter Issues for Volunteers?

- Focus: Volunteers only see what they can fix
- Performance: Smaller dataset to render
- Gamification: Clear "work queue" mentality

### 4. Why Separate Leaderboards?

- Fairness: Volunteers compete on fixes, citizens on reports
- Motivation: Each group has relevant metrics
- Option to show "all" leaderboard later if needed

---

## Testing Strategy

### Manual Testing Checklist

1. **Sign up as Citizen**

   - Verify 5 tabs appear
   - Verify can access IssueUpload screen
   - Verify leaderboard shows all users

2. **Sign up as Volunteer**

   - Verify only 4 tabs (no IssueUpload)
   - Verify "Upload Fix" button appears on posts
   - Verify can open fix upload modal
   - Verify can submit fix with images
   - Verify leaderboard shows only volunteers

3. **User Type Persistence**

   - Log out and log back in
   - Verify user type is maintained
   - Verify correct tabs show

4. **Edge Cases**
   - No images in fix upload → Show error
   - No location permission → Handle gracefully
   - Backend error → Show retry option

---

## Additional Enhancements (Future)

1. **Issue Assignment**: Allow volunteers to "claim" an issue before fixing
2. **Before/After Comparison**: Split images into before/after categories
3. **Fix Verification**: Allow citizens to verify fixes before marking resolved
4. **Notifications**: Notify citizen when their issue is fixed
5. **Fix History**: Show list of all fixes by a volunteer
6. **Team/Organization Stats**: Aggregate stats by volunteer organization
7. **Challenge System**: Weekly challenges for volunteers (e.g., "Fix 10 potholes")

---

## File Structure Summary

```
src/
├── App.js                          [MODIFY] Add conditional tab navigation
├── components/
│   ├── FixUploadModal.js          [CREATE]  New fix upload modal
│   └── ... (existing components)
├── context/
│   └── UserContext.js             [NO CHANGE] Already has userType
├── screens/
│   ├── HomeScreen.js              [MODIFY] Add volunteer features
│   ├── LeaderboardScreen.js       [MODIFY] Implement with filtering
│   ├── ProfileScreen.js           [MODIFY] Update for volunteer
│   └── ... (existing screens)
└── services/
    └── api.js                      [NO CHANGE] Already configured
```

---

## Conclusion

This implementation creates a clear separation between Citizens (issue reporters) and Volunteers (issue fixers) while maintaining a unified codebase. The key is conditional rendering based on `profile.userType` throughout the app, with the most significant change being the tab navigation structure.

The volunteer experience focuses on:

- **Seeing problems** (HomeScreen feed)
- **Documenting solutions** (Fix upload modal)
- **Competing with peers** (Volunteer leaderboard)

This gamified approach encourages civic engagement from both perspectives.
