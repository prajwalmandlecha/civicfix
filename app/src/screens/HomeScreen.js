import React, { useState, useEffect, useLayoutEffect } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl } from "react-native";
import SocialPost from "../components/SocialPost";
import IssueDetailModal from "../components/IssueDetailModal";
import api from "../services/api";
import { useUserContext } from "../context/UserContext";
import * as Location from "expo-location";

const HomeScreen = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const { lastLocation } = useUserContext();

  useEffect(() => {
    getPosts();
  }, [lastLocation]);

  const handleLike = (postId) => {
    setPosts(
      posts.map((post) =>
        post.id === postId ? { ...post, likes: post.likes + 1 } : post
      )
    );
  };

  const formatLocation = async (location) => {
    if (!location) return "Unknown location";
    try {
      const addressParts = await Location.reverseGeocodeAsync({
        latitude: location.lat,
        longitude: location.lon,
      });
      console.log(
        "Reverse geocode result for location:",
        location,
        addressParts
      );
      if (addressParts.length > 0) {
        const { name, street } = addressParts[0];
        return [name, street].filter(Boolean).join(", ");
      }
    } catch (e) {
      console.log("Error formatting location:", e);
    }
    return "Unknown location";
  };

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
        issueTypes: issue.detected_issues,
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
        detailedData: issue, // Store the complete issue data
      }))
    );
    console.log("Fetched Issues", issues);
    setPosts(issues);
    // console.log("Issues", response.data);
    console.dir(response.data.issues, { depth: null });
  };

  const handleFixToggle = (postId) => {
    setPosts(
      posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              status: post.status === "resolved" ? "unresolved" : "resolved",
            }
          : post
      )
    );
  };

  const handleSameIssue = (postId) => {
    console.log(`Same issue elsewhere for post ${postId}`);
  };

  const handlePostPress = (post) => {
    setSelectedIssue(post);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedIssue(null);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await getPosts();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        renderItem={({ item }) => (
          <SocialPost
            postId={item.id}
            issueTypes={item.issueTypes}
            location={item.location}
            postImage={item.postImage}
            impactLevel={item.impactLevel}
            co2Impact={item.co2Impact}
            likes={item.likes}
            status={item.status}
            detailedData={item.detailedData}
            onLike={() => handleLike(item.id)}
            onFixToggle={() => handleFixToggle(item.id)}
            onSameIssue={() => handleSameIssue(item.id)}
            onPress={() => handlePostPress(item)}
          />
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

      <IssueDetailModal
        visible={modalVisible}
        onClose={handleCloseModal}
        issueData={selectedIssue}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  listContent: {
    padding: 16,
    // paddingBottom: 100, // Account for bottom tab bar + extra spacing
  },
});

export default HomeScreen;
