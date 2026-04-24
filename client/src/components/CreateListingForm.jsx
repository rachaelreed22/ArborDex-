import { useState } from "react";
import { useMode } from "../context/ModeContext";
import { Navigate } from "react-router-dom";

export default function CreateListingForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const { mode } = useMode();

  if (mode === "tag") {
  return <Navigate to="/" replace />;
  }
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("http://localhost:5000/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, location }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage("Error creating listing");
        setLoading(false);
        return;
      }

      setMessage("Listing created successfully!");
      setTitle("");
      setDescription("");
      setLocation("");
    } catch (err) {
      console.error(err);
      setMessage("Server error");
    }

    setLoading(false);
  };

  return (
    <div style={{ maxWidth: "500px", margin: "20px auto" }}>
      <h2>Create a New Listing</h2>

      <form onSubmit={handleSubmit}>
        <label>Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        <label>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />

        <label>Location</label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Listing"}
        </button>
      </form>

      {message && <p>{message}</p>}
    </div>
  );
}
