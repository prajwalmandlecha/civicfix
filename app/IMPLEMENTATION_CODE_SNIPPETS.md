# Quick Reference: Code Snippets for Volunteer Implementation

This document contains ready-to-use code snippets for implementing the volunteer user role.

---

## 1. Conditional Tab Navigation in App.js

**File:** `src/App.js`

**Add these imports:**

```javascript
import { useUserContext } from "./context/UserContext";
```

**Replace the TabNav function:**

```javascript
const TabNav = () => {
  const { profile } = useUserContext();
  const isVolunteer = profile?.userType === "volunteer";

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: "#ffffff",
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: "#f0f0f0",
        },
        headerTitleStyle: {
          fontWeight: "700",
          fontSize: 20,
          color: "#1a1a1a",
        },
        tabBarActiveTintColor: "#6FCF97",
        headerTintColor: "#4285f4",
        headerRight: () => <LogoutButton />,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerTitle: "CivicFix Feed",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Location"
        component={LocationScreen}
        options={{
          headerTitle: "Nearby Issues",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="location-on" size={size} color={color} />
          ),
        }}
      />

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

      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{
          headerTitle: "Leaderboard",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="bar-chart" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerTitle: "Profile",
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};
```

---

## 2. HomeScreen Modifications

**File:** `src/screens/HomeScreen.js`

**Add these imports:**

```javascript
import { MaterialIcons } from "@expo/vector-icons";
import { TouchableOpacity } from "react-native";
import { auth } from "../services/firebase";
import FixUploadModal from "../components/FixUploadModal";
```

**Add state variables at the top of HomeScreen component:**

```javascript
const HomeScreen = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [showFixUploadModal, setShowFixUploadModal] = useState(false);

  const { lastLocation, profile } = useUserContext();
  const isVolunteer = profile?.userType === 'volunteer';

  // ... rest of component
```

**Modify getPosts function to filter for volunteers:**

```javascript
const getPosts = async () => {
  if (!lastLocation || !lastLocation.coords) {
    setPosts([]);
    return;
  }
  console.log("Fetching posts for location:", lastLocation);
  const response = await api.get("/issues/", {
    params: {
      latitude: lastLocation.coords.latitude,
      longitude: lastLocation.coords.longitude,
      limit: 20,
    },
  });
  console.log("API Response:", response.data);

  // Format locations asynchronously for all issues
  const issues = await Promise.all(
    response.data.issues.map(async (issue) => ({
      id: issue.issue_id,
      issueTypes: issue.issue_types,
      location: await formatLocation(issue.location),
      postImage: {
        uri: issue.photo_url,
      },
      impactLevel:
        issue.severity_score > 7
          ? "High"
          : issue.severity_score > 4
          ? "Medium"
          : "Low",
      co2Impact: issue.co2Impact,
      likes: issue.upvotes.open,
      status: issue.status,
    }))
  );

  // NEW: Filter for volunteers - only show unresolved issues
  const filteredIssues = isVolunteer
    ? issues.filter((issue) => issue.status !== "resolved")
    : issues;

  console.log("Fetched Issues", filteredIssues);
  setPosts(filteredIssues);
  console.dir(response.data.issues, { depth: null });
};
```

**Add handleFixUpload function:**

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

**Modify the return statement:**

```javascript
return (
  <View style={styles.container}>
    <FlatList
      data={posts}
      renderItem={({ item }) => (
        <View>
          <SocialPost
            postId={item.id}
            issueTypes={item.issueTypes}
            location={item.location}
            postImage={item.postImage}
            impactLevel={item.impactLevel}
            co2Impact={item.co2Impact}
            likes={item.likes}
            status={item.status}
            onLike={() => handleLike(item.id)}
            onFixToggle={() => handleFixToggle(item.id)}
            onSameIssue={() => handleSameIssue(item.id)}
          />

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
      keyExtractor={(item) => item.id.toString()}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#4285f4"
          colors={["#4285f4"]}
        />
      }
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
```

**Add new styles:**

```javascript
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  listContent: {
    padding: 16,
  },
  // NEW styles
  uploadFixButton: {
    backgroundColor: "#4CAF50",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    marginHorizontal: 16,
    marginTop: -8,
    marginBottom: 16,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  uploadFixText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
    marginLeft: 8,
  },
});
```

---

## 3. Complete FixUploadModal Component

**File:** `src/components/FixUploadModal.js` (CREATE NEW FILE)

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
  const [images, setImages] = useState([]);
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

## 4. Profile Screen Updates

**File:** `src/screens/ProfileScreen.js`

**Update the userType badge (around line 86-87):**

```javascript
<View style={styles.userTypeBadge}>
  <Text style={styles.userTypeText}>
    {userData?.userType === "volunteer" ? "🔧 Volunteer" : "👤 Citizen"}
  </Text>
</View>
```

**Update organization section check (around line 121):**

```javascript
{
  userData?.userType === "volunteer" && (
    <Card style={styles.organizationCard}>
      <Text style={styles.organizationLabel}>Organization</Text>
      <Text style={styles.organizationText}>
        {userData?.organization || "Not set"}
      </Text>
      <View style={styles.organizationButtonWrapper}>
        <View style={styles.organizationButton}>
          <Text style={styles.organizationButtonText}>Update Organization</Text>
        </View>
      </View>
    </Card>
  );
}
```

**Update stats display (around line 140-148):**

```javascript
<View style={styles.statCardWrapper}>
  <StatCard
    emoji={userData?.userType === "volunteer" ? "🔧" : "📸"}
    number={
      userData?.userType === "volunteer"
        ? stats.fixesCompleted || 0
        : stats.issuesUploaded
    }
    label={
      userData?.userType === "volunteer" ? "Fixes Completed" : "Issues Reported"
    }
    size="small"
  />
</View>
```

---

## 5. Leaderboard Implementation

**File:** `src/screens/LeaderboardScreen.js`

**Replace entire file with:**

```javascript
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useUserContext } from "../context/UserContext";
import api from "../services/api";
import Card from "../components/Card";

const LeaderboardScreen = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

      setLeaderboard(response.data.users || []);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      setLeaderboard([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLeaderboard();
    setRefreshing(false);
  };

  const renderLeaderboardItem = ({ item, index }) => (
    <Card style={styles.leaderboardCard}>
      <View
        style={[
          styles.rankBadge,
          index === 0 && styles.rankBadgeGold,
          index === 1 && styles.rankBadgeSilver,
          index === 2 && styles.rankBadgeBronze,
        ]}
      >
        <Text style={styles.rankText}>#{index + 1}</Text>
      </View>

      <View style={styles.userInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.name?.charAt(0).toUpperCase() || "?"}
          </Text>
        </View>
        <View style={styles.userDetails}>
          <Text style={styles.userName}>{item.name || "Anonymous"}</Text>
          <Text style={styles.userType}>
            {item.userType === "volunteer" ? "🔧 Volunteer" : "👤 Citizen"}
          </Text>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{item.karma || 0}</Text>
          <Text style={styles.statLabel}>Karma</Text>
        </View>
        {isVolunteer && (
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{item.fixesCompleted || 0}</Text>
            <Text style={styles.statLabel}>Fixes</Text>
          </View>
        )}
        {!isVolunteer && (
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{item.issuesReported || 0}</Text>
            <Text style={styles.statLabel}>Reports</Text>
          </View>
        )}
      </View>
    </Card>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4285f4" />
      </View>
    );
  }

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

      {leaderboard.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No data available yet</Text>
        </View>
      ) : (
        <FlatList
          data={leaderboard}
          renderItem={renderLeaderboardItem}
          keyExtractor={(item, index) => item.userId || index.toString()}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4285f4"
              colors={["#4285f4"]}
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
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
  rankBadgeGold: {
    backgroundColor: "#FFD700",
  },
  rankBadgeSilver: {
    backgroundColor: "#C0C0C0",
  },
  rankBadgeBronze: {
    backgroundColor: "#CD7F32",
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

---

## 6. Backend API Endpoints Needed

### Endpoint 1: Submit Fix

**Route:** `POST /submit-fix`

**Request (multipart/form-data):**

```javascript
{
  files: [Image],          // Array of image files
  issue_id: "string",      // Issue being fixed
  notes: "string",         // Optional description
  timestamp: "ISO string", // When fix was submitted
  fixed_by: "uid",        // Firebase user ID
}
```

**Response:**

```javascript
{
  success: true,
  message: "Fix submitted successfully",
  karma_earned: 50,
  issue_status: "resolved",
  fix_id: "generated_fix_id",
}
```

**Backend Logic:**

1. Store images in cloud storage (S3, Firebase Storage, etc.)
2. Update issue document: `status = "resolved"`, add `resolved_at`, add `fixed_by`
3. Create fix document with images, notes, timestamp
4. Update volunteer user: increment `fixesCompleted`, add karma
5. Optional: Send notification to original reporter
6. Return success response

---

### Endpoint 2: Leaderboard

**Route:** `GET /leaderboard`

**Query Parameters:**

```javascript
{
  userType: "volunteer" | "all",  // Filter by user type
  limit: number,                   // Max results (default: 50)
}
```

**Response:**

```javascript
{
  users: [
    {
      userId: "string",
      name: "string",
      userType: "citizen" | "volunteer",
      karma: number,
      fixesCompleted: number, // For volunteers
      issuesReported: number, // For citizens
    },
    // ... more users
  ];
}
```

**Backend Logic:**

1. Query Firestore `users` collection
2. Filter by `userType` if specified
3. Sort by `karma` descending
4. Limit results
5. Return formatted user data

---

## 7. Quick Test Checklist

### For Citizen Users:

- [ ] Can see 5 tabs in tab bar
- [ ] Can access IssueUpload screen
- [ ] Can upload new issues
- [ ] Can see all issues (resolved + unresolved) in feed
- [ ] Leaderboard shows all users

### For Volunteer Users:

- [ ] Can see only 4 tabs (no IssueUpload)
- [ ] Cannot access IssueUpload screen
- [ ] Can see "Upload Fix" button on each issue
- [ ] Can open fix upload modal
- [ ] Can upload multiple images for fix
- [ ] Can see only unresolved issues in feed
- [ ] Leaderboard shows only volunteers
- [ ] Profile shows "Fixes Completed" instead of "Issues Reported"

### Edge Cases:

- [ ] No location permission → Handle gracefully
- [ ] No images in fix upload → Show error
- [ ] Network error → Show retry option
- [ ] Empty feed → Show appropriate message
- [ ] Backend error → Show user-friendly message

---

## 8. Implementation Order

1. **Phase 1: Navigation** (30 min)

   - Update `App.js` with conditional tabs
   - Test navigation for both user types

2. **Phase 2: HomeScreen** (1 hour)

   - Add volunteer filtering logic
   - Add "Upload Fix" button
   - Test display for both user types

3. **Phase 3: Modal** (2 hours)

   - Create `FixUploadModal.js`
   - Test image picker
   - Test form validation

4. **Phase 4: API Integration** (varies)

   - Backend: Create endpoints
   - Frontend: Connect to backend
   - Test end-to-end flow

5. **Phase 5: Leaderboard** (1 hour)

   - Implement leaderboard screen
   - Test filtering

6. **Phase 6: Profile** (30 min)
   - Update profile screen
   - Test stats display

**Total Frontend Estimate:** ~5 hours  
**Total Backend Estimate:** ~4 hours (if starting from scratch)

---

## Quick Reference: Where to Find User Type

```javascript
// In any screen or component:
import { useUserContext } from "../context/UserContext";

const MyComponent = () => {
  const { profile } = useUserContext();
  const isVolunteer = profile?.userType === "volunteer";
  const isCitizen = profile?.userType === "citizen";

  // Use for conditional rendering
  if (isVolunteer) {
    // Volunteer-specific code
  } else {
    // Citizen-specific code
  }
};
```

---

This quick reference provides all the code you need to copy-paste for implementation!
