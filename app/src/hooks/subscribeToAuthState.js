import { auth } from "../services/firebase";
import { useState, useEffect } from "react";

const subscribeToAuthState = () => {
  const [user, setUser] = useState(null);
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((authUser) => {
      console.log("Auth state changed:", authUser);
      setUser(authUser);
    });
    return () => unsubscribe();
  }, []);
  return user;
};

export default subscribeToAuthState;
