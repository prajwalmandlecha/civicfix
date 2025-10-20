import { auth } from "../services/firebase";
import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";

const subscribeToAuthState = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      console.log("Auth state changed:", authUser);
      setUser(authUser);
      setLoading(false);
    });
    return () => unsubscribe && unsubscribe();
  }, []);
  return { user, loading };
};

export default subscribeToAuthState;
