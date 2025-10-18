import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, RefreshControl } from "react-native";
import SocialPost from "../components/SocialPost";

const HomeScreen = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState([
    {
      id: 1,
      issueType: "Pothole",
      location: "Main St & 5th Ave",
      postImage: {
        uri: "https://images.unsplash.com/photo-1615671524827-c1fe3973b648?w=400&h=300&fit=crop",
      },
      impactLevel: "High",
      co2Impact: "45kg CO₂ if unresolved",
      likes: 127,
      status: "unresolved",
    },
    {
      id: 2,
      issueType: "Streetlight",
      location: "Park Avenue",
      postImage: {
        uri: "https://images.unsplash.com/photo-1473186578172-c141e6798cf4?w=400&h=300&fit=crop",
      },
      impactLevel: "Medium",
      co2Impact: "28kg CO₂ if unresolved",
      likes: 89,
      status: "unresolved",
    },
    {
      id: 3,
      issueType: "Garbage",
      location: "Central Park West",
      postImage: {
        uri: "https://images.unsplash.com/photo-1473186578172-c141e6798cf4?w=400&h=300&fit=crop",
      },
      impactLevel: "Low",
      co2Impact: "12kg CO₂ saved",
      likes: 156,
      status: "resolved",
    },
  ]);

  const handleLike = (postId) => {
    setPosts(
      posts.map((post) =>
        post.id === postId ? { ...post, likes: post.likes + 1 } : post
      )
    );
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

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        renderItem={({ item }) => (
          <SocialPost
            postId={item.id}
            issueType={item.issueType}
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
