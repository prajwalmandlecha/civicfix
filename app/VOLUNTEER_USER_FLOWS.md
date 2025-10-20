# Volunteer vs Citizen User Flows

## Visual Flow Comparison

### Authentication Flow (Both User Types)

```
┌─────────────┐
│   App Load  │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Check Firebase  │
│  Auth State     │
└──────┬──────────┘
       │
       ├─── Not Authenticated ──────┐
       │                            ▼
       │                   ┌─────────────────┐
       │                   │  Login Screen   │
       │                   └────────┬────────┘
       │                            │
       │                            ├─── Existing User → Login
       │                            │
       │                            └─── New User ──────┐
       │                                                 ▼
       │                                        ┌─────────────────┐
       │                                        │ Signup Screen   │
       │                                        │ - Select Type:  │
       │                                        │   • Citizen     │
       │                                        │   • Volunteer   │
       │                                        └────────┬────────┘
       │                                                 │
       └─── Authenticated ─────────┬────────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ Fetch User      │
                          │ Profile from    │
                          │ Firestore       │
                          └────────┬────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ Check userType  │
                          │ in profile      │
                          └────────┬────────┘
                                   │
                ┌──────────────────┴──────────────────┐
                │                                     │
                ▼                                     ▼
    ┌────────────────────┐              ┌────────────────────┐
    │ CITIZEN EXPERIENCE │              │VOLUNTEER EXPERIENCE│
    │    (5 Tabs)        │              │    (4 Tabs)        │
    └────────────────────┘              └────────────────────┘
```

---

## Citizen User Flow

### Tab Navigation

```
┌────────────────────────────────────────────────────────────┐
│                    Tab Navigation (5 tabs)                  │
├─────────┬─────────┬─────────────┬─────────────┬────────────┤
│  Home   │Location │ IssueUpload │ Leaderboard │  Profile   │
│   🏠    │   📍    │     ➕      │     📊      │    👤      │
└─────────┴─────────┴─────────────┴─────────────┴────────────┘
```

### Home Screen Flow (Citizen)

```
┌─────────────────────────────────────┐
│         Home Screen (Citizen)        │
│                                     │
│  ┌───────────────────────────────┐ │
│  │     Issue Card #1 (Open)      │ │
│  │  - Photo                       │ │
│  │  - Issue Types                 │ │
│  │  - Location                    │ │
│  │  - Impact Level                │ │
│  │  - Likes, Status               │ │
│  │                                │ │
│  │  [❤️ Like] [✓ Fixed] [📍 Same] │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │   Issue Card #2 (Resolved)    │ │
│  │  ...                           │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │     Issue Card #3 (Open)      │ │
│  │  ...                           │ │
│  └───────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### Issue Upload Flow (Citizen Only)

```
┌─────────────────────────┐
│  Tap "IssueUpload" Tab  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────────┐
│     IssueUpload Screen              │
│                                     │
│  1. 📸 Upload Image                 │
│     - Take Photo / Choose Library   │
│                                     │
│  2. 📝 Add Description              │
│     - Text input                    │
│                                     │
│  3. 📍 Set Location                 │
│     - Use Current Location          │
│     - Search Location               │
│                                     │
│  4. ☑️  Anonymous (optional)        │
│                                     │
│  5. [Submit Issue] Button           │
└───────────┬─────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  Upload to Backend      │
│  POST /submit-issue     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  AI Detects Issue Types │
│  Store in Database      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Success! +10 Karma     │
│  Return to Home         │
└─────────────────────────┘
```

---

## Volunteer User Flow

### Tab Navigation

```
┌────────────────────────────────────────────────────────┐
│              Tab Navigation (4 tabs)                    │
├─────────┬─────────┬─────────────┬──────────────────────┤
│  Home   │Location │ Leaderboard │      Profile         │
│   🏠    │   📍    │     📊      │        👤            │
└─────────┴─────────┴─────────────┴──────────────────────┘

          Note: NO IssueUpload tab!
```

### Home Screen Flow (Volunteer)

```
┌──────────────────────────────────────────────┐
│       Home Screen (Volunteer)                │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │    Issue Card #1 (Unresolved Only)     │ │
│  │  - Photo                                │ │
│  │  - Issue Types: pothole, road damage   │ │
│  │  - Location: Main St, City             │ │
│  │  - Impact: High                         │ │
│  │                                         │ │
│  │  [❤️ Like] [✓ Fixed] [📍 Same]          │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │      [🔧 Upload Fix] Button            │ │ ← NEW!
│  │   Click to document your fix           │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │    Issue Card #2 (Unresolved Only)     │ │
│  │  ...                                    │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │      [🔧 Upload Fix] Button            │ │ ← NEW!
│  └────────────────────────────────────────┘ │
│                                              │
└──────────────────────────────────────────────┘

Key Differences:
✅ Only shows UNRESOLVED issues
✅ Each issue has "Upload Fix" button
❌ No resolved issues shown
❌ No "Report Issue" tab
```

### Fix Upload Flow (Volunteer Only)

```
┌─────────────────────────┐
│  Tap "Upload Fix"       │
│  on Issue Card          │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│      Fix Upload Modal (Full Screen)     │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  Fixing Issue:                    │ │
│  │  📋 Pothole, Road Damage          │ │
│  │  📍 Main St, City                 │ │
│  └───────────────────────────────────┘ │
│                                         │
│  📷 Before & After Photos               │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐     │
│  │ 📸  │ │ 📸  │ │ 📸  │ │  +  │     │
│  │Image│ │Image│ │Image│ │ Add │     │
│  └─────┘ └─────┘ └─────┘ └─────┘     │
│                                         │
│  📝 Notes (Optional)                    │
│  ┌───────────────────────────────────┐ │
│  │ Fixed the pothole with asphalt... │ │
│  │                                   │ │
│  └───────────────────────────────────┘ │
│                                         │
│  [Submit Fix] Button                    │
│                                         │
└───────────┬─────────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  Upload to Backend      │
│  POST /submit-fix       │
│  - Multiple images      │
│  - Notes                │
│  - Issue ID             │
│  - Volunteer ID         │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Backend Processes:     │
│  - Store fix images     │
│  - Update issue status  │
│  - Award karma points   │
│  - Notify citizen       │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Success! +50 Karma     │
│  Issue marked resolved  │
│  Modal closes           │
│  HomeScreen refreshes   │
└─────────────────────────┘
```

---

## Leaderboard Flow Comparison

### Citizen Leaderboard

```
┌─────────────────────────────────────┐
│     🏆 Community Leaderboard        │
│   Top contributors by karma points  │
├─────────────────────────────────────┤
│                                     │
│  #1  👤 John Doe (Citizen)          │
│      ⭐ 450 Karma | 📸 45 Reports   │
│                                     │
│  #2  🔧 Jane Smith (Volunteer)      │
│      ⭐ 420 Karma | 🔧 21 Fixes     │
│                                     │
│  #3  👤 Bob Wilson (Citizen)        │
│      ⭐ 380 Karma | 📸 38 Reports   │
│                                     │
│  #4  🔧 Alice Brown (Volunteer)     │
│      ⭐ 350 Karma | 🔧 17 Fixes     │
│                                     │
│  ...                                │
│                                     │
└─────────────────────────────────────┘

Shows: ALL users, ranked by karma
```

### Volunteer Leaderboard

```
┌─────────────────────────────────────┐
│     🔧 Volunteer Leaderboard        │
│   Top volunteers by fixes completed │
├─────────────────────────────────────┤
│                                     │
│  #1  🔧 Jane Smith                  │
│      ⭐ 420 Karma | 🔧 21 Fixes     │
│                                     │
│  #2  🔧 Alice Brown                 │
│      ⭐ 350 Karma | 🔧 17 Fixes     │
│                                     │
│  #3  🔧 Carlos Martinez             │
│      ⭐ 310 Karma | 🔧 15 Fixes     │
│                                     │
│  #4  🔧 Diana Chen                  │
│      ⭐ 280 Karma | 🔧 14 Fixes     │
│                                     │
│  ...                                │
│                                     │
└─────────────────────────────────────┘

Shows: ONLY volunteers, ranked by karma/fixes
```

---

## Profile Screen Comparison

### Citizen Profile

```
┌─────────────────────────────────────┐
│         John Doe                    │
│     john@example.com                │
│      👤 Citizen                     │
├─────────────────────────────────────┤
│   450 Karma    |    #1 Rank         │
├─────────────────────────────────────┤
│                                     │
│  📍 Current Location                │
│     123 Main St, City               │
│     [Update Location]               │
│                                     │
├─────────────────────────────────────┤
│  📊 Your Impact                     │
│                                     │
│  📸 Issues Reported                 │
│      45                             │
│                                     │
│  ✅ Issues Resolved                 │
│      32                             │
│                                     │
│  🌍 CO₂ Saved                       │
│      340kg                          │
│                                     │
├─────────────────────────────────────┤
│  🏅 Badges & Achievements           │
│  🌟 ⭐ 🏆 🎯 ✨                      │
│                                     │
└─────────────────────────────────────┘
```

### Volunteer Profile

```
┌─────────────────────────────────────┐
│         Jane Smith                  │
│     jane@example.com                │
│      🔧 Volunteer                   │
├─────────────────────────────────────┤
│   420 Karma    |    #2 Rank         │
├─────────────────────────────────────┤
│                                     │
│  📍 Current Location                │
│     456 Oak Ave, City               │
│     [Update Location]               │
│                                     │
│  🏢 Organization                    │ ← NEW!
│     City Volunteer Corps            │
│     [Update Organization]           │
│                                     │
├─────────────────────────────────────┤
│  📊 Your Impact                     │
│                                     │
│  🔧 Fixes Completed                 │ ← DIFFERENT!
│      21                             │
│                                     │
│  ✅ Issues Resolved                 │
│      21                             │
│                                     │
│  🌍 CO₂ Saved                       │
│      420kg                          │
│                                     │
├─────────────────────────────────────┤
│  🏅 Badges & Achievements           │
│  🔧 🛠️ ⚙️ 🎖️ 🏆                    │
│                                     │
└─────────────────────────────────────┘
```

---

## State Management Flow

### UserContext Data Flow

```
┌─────────────────────────────────────────┐
│         Firebase Auth                   │
│     (User authentication)               │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│         UserContext                     │
│                                         │
│  - user (auth object)                   │
│  - profile (Firestore data)             │
│    └─ userType: "citizen" | "volunteer"│
│    └─ name, email, karma, etc.         │
│  - lastLocation                         │
│  - loading                              │
│                                         │
└────────────┬────────────────────────────┘
             │
             ├─────────────────────────────┐
             │                             │
             ▼                             ▼
┌───────────────────────┐    ┌───────────────────────┐
│     App.js            │    │   All Screens         │
│                       │    │                       │
│  Conditional Tab Nav  │    │  - HomeScreen         │
│  based on userType    │    │  - LeaderboardScreen  │
│                       │    │  - ProfileScreen      │
└───────────────────────┘    └───────────────────────┘
```

---

## Decision Tree: Component Rendering

```
                    App Loads
                        │
                        ▼
                 User Authenticated?
                   /         \
                 NO          YES
                 │            │
                 ▼            ▼
           Show Login    Fetch Profile
                          from Firestore
                               │
                               ▼
                      Check profile.userType
                               │
                ┌──────────────┴──────────────┐
                │                             │
                ▼                             ▼
        userType === "citizen"     userType === "volunteer"
                │                             │
                ▼                             ▼
        ┌─────────────────┐         ┌─────────────────┐
        │ Render 5 Tabs:  │         │ Render 4 Tabs:  │
        │ - Home          │         │ - Home          │
        │ - Location      │         │ - Location      │
        │ - IssueUpload   │         │ - Leaderboard   │
        │ - Leaderboard   │         │ - Profile       │
        │ - Profile       │         │                 │
        └─────────────────┘         └─────────────────┘
                │                             │
                ▼                             ▼
        ┌─────────────────┐         ┌─────────────────┐
        │ HomeScreen:     │         │ HomeScreen:     │
        │ - All issues    │         │ - Only open     │
        │ - No fix button │         │ - Fix button ✅ │
        └─────────────────┘         └─────────────────┘
                │                             │
                ▼                             ▼
        ┌─────────────────┐         ┌─────────────────┐
        │ Leaderboard:    │         │ Leaderboard:    │
        │ - All users     │         │ - Only volunt.  │
        └─────────────────┘         └─────────────────┘
```

---

## Issue Lifecycle with Both User Types

```
    [Citizen Reports Issue]
             │
             ▼
    ┌─────────────────────┐
    │  Issue Created      │
    │  Status: "open"     │
    │  + 10 Karma         │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │  Visible to ALL     │
    │  on Home Feeds      │
    └──────────┬──────────┘
               │
               ├─── Citizens see it (can like, comment)
               │
               └─── Volunteers see it + [Upload Fix] button
                            │
                            ▼
                 [Volunteer Uploads Fix]
                            │
                            ▼
                ┌─────────────────────┐
                │  Fix Submitted      │
                │  - Photos uploaded  │
                │  - Notes added      │
                │  + 50 Karma         │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  Backend Updates:   │
                │  - Issue → resolved │
                │  - Store fix data   │
                │  - Notify citizen   │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  Issue Resolved     │
                │  Status: "resolved" │
                └──────────┬──────────┘
                           │
                           ├─── Citizen sees resolved status
                           │
                           └─── Volunteer: Issue removed from feed
                                    (filtered out)
```

---

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                         Frontend                              │
│                                                               │
│  ┌────────────┐                                              │
│  │   App.js   │ ← reads → ┌─────────────────────┐          │
│  └────────────┘           │   UserContext       │          │
│        │                  │   - user            │          │
│        │                  │   - profile         │          │
│        │                  │     - userType      │          │
│        │                  └─────────────────────┘          │
│        │                           ▲                        │
│        │                           │ fetch                  │
│        │                           │                        │
│        ▼                           │                        │
│  ┌────────────┐                   │                        │
│  │  Tab Nav   │                   │                        │
│  │ (4 or 5)   │                   │                        │
│  └────────────┘                   │                        │
│        │                           │                        │
│        ├───────────────┬───────────┼──────────┐            │
│        │               │           │          │            │
│        ▼               ▼           │          ▼            │
│  ┌──────────┐   ┌──────────┐      │    ┌──────────┐      │
│  │   Home   │   │ Leader   │      │    │ Profile  │      │
│  │  Screen  │   │  board   │      │    │  Screen  │      │
│  └──────────┘   └──────────┘      │    └──────────┘      │
│        │               │           │          │            │
│        │ GET /issues   │           │          │            │
│        │               │ GET       │          │ GET        │
│        │               │ /leader   │          │ /user      │
└────────┼───────────────┼───────────┼──────────┼────────────┘
         │               │           │          │
         │               │           │          │
         ▼               ▼           │          ▼
┌──────────────────────────────────────────────────────────────┐
│                         Backend API                           │
│                                                               │
│  GET  /issues?lat=x&lon=y&limit=20                          │
│  POST /submit-issue (multipart/form-data)                    │
│  POST /submit-fix (multipart/form-data)                      │
│  GET  /leaderboard?userType={type}&limit=50                  │
│                                                               │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                    Firestore Database                         │
│                                                               │
│  Collections:                                                 │
│  - users { userType, karma, issuesReported, fixesCompleted } │
│  - issues { status, location, issueTypes, severity }         │
│  - fixes { issueId, fixedBy, images[], notes, timestamp }    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Key Interaction Points

### 1. App Load → User Type Detection

```javascript
// src/App.js
const App = () => {
  const { user, loading } = subscribeToAuthState();

  if (loading) return <LoadingSpinner />;

  return (
    <UserProvider>
      {" "}
      {/* Fetches profile with userType */}
      <NavigationContainer>
        {user ? <TabNav /> : <StackNav />}
      </NavigationContainer>
    </UserProvider>
  );
};

const TabNav = () => {
  const { profile } = useUserContext(); // Get userType here
  const isVolunteer = profile?.userType === "volunteer";

  return <Tab.Navigator>{/* Conditional tab rendering */}</Tab.Navigator>;
};
```

### 2. HomeScreen → Issue Display Logic

```javascript
// src/screens/HomeScreen.js
const HomeScreen = () => {
  const { profile } = useUserContext();
  const isVolunteer = profile?.userType === 'volunteer';

  const getPosts = async () => {
    const response = await api.get('/issues/', { params: {...} });
    const allIssues = response.data.issues;

    // Filter for volunteers
    const displayIssues = isVolunteer
      ? allIssues.filter(i => i.status !== 'resolved')
      : allIssues;

    setPosts(displayIssues);
  };

  return (
    <FlatList
      data={posts}
      renderItem={({ item }) => (
        <>
          <SocialPost {...item} />
          {isVolunteer && (
            <UploadFixButton onPress={() => openFixModal(item)} />
          )}
        </>
      )}
    />
  );
};
```

### 3. Fix Upload → Backend Update

```javascript
// When volunteer submits fix
const handleFixUpload = async (fixData) => {
  // 1. Upload images to backend
  const formData = new FormData();
  fixData.images.forEach((img) => formData.append("files", img));
  formData.append("issue_id", fixData.issueId);
  formData.append("fixed_by", auth.currentUser.uid);

  // 2. Backend processes
  const response = await api.post("/submit-fix", formData);

  // 3. Backend:
  //    - Saves fix images to storage
  //    - Updates issue.status = "resolved"
  //    - Increments volunteer.fixesCompleted
  //    - Awards volunteer.karma += 50
  //    - Sends notification to citizen

  // 4. Frontend refreshes
  await getPosts(); // Issue now filtered out for volunteer
};
```

---

## Summary of Key Differences

| Aspect               | Citizen                      | Volunteer              |
| -------------------- | ---------------------------- | ---------------------- |
| **Tabs**             | 5 (includes IssueUpload)     | 4 (no IssueUpload)     |
| **HomeScreen Feed**  | All issues (open + resolved) | Only unresolved issues |
| **Primary Action**   | Report new issues            | Fix existing issues    |
| **Upload Button**    | In separate tab              | Inline with each issue |
| **Upload Content**   | Problem photos               | Solution photos        |
| **Leaderboard View** | All users                    | Volunteers only        |
| **Profile Stats**    | Issues Reported              | Fixes Completed        |
| **Karma Source**     | +10 per report               | +50 per fix            |
| **Additional Field** | None                         | Organization           |

---

## UX Considerations

### Why These Design Choices?

1. **No IssueUpload Tab for Volunteers**

   - Cleaner navigation
   - Prevents confusion
   - Enforces role separation

2. **Inline Fix Upload Button**

   - Contextual action
   - Immediate association with issue
   - No need to navigate away from feed

3. **Filtered Feed for Volunteers**

   - Shows only actionable items
   - Reduces cognitive load
   - Creates sense of "work queue"

4. **Separate Leaderboards**

   - Fair competition within role
   - Different metrics for different roles
   - Encourages role-specific engagement

5. **Organization Field for Volunteers**
   - Enables team/group features
   - Facilitates partnerships with local orgs
   - Adds legitimacy to volunteer work

---

## Edge Cases to Handle

1. **User Changes Type**: If a user's `userType` changes in Firestore, app should:

   - Detect change in UserContext
   - Re-render navigation
   - Clear cached data

2. **No Location Permission**: Both user types need graceful handling when location is denied

3. **Network Errors**: All API calls should have retry logic and user-friendly error messages

4. **Empty States**:

   - Citizen: "No issues in your area"
   - Volunteer: "All issues resolved! 🎉"

5. **Image Upload Failures**: Should save form data and allow retry without re-entering

---

This visual guide provides a complete understanding of how the two user roles navigate and interact with the CivicFix app!
