 import { useEffect, useState } from "react";
import { useMode } from "../context/ModeContext";
import { Link } from "react-router-dom";

export default function TreeList() {
  const { mode } = useMode(); // "tag" = public, "dex" = staff
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch all listings from backend
  useEffect(() => {
    async function fetchListings() {
      try {
        const res = await fetch("http://localhost:5000/listings");
        const data = await res.json();
        setListings(data || []);
      } catch (err) {
        console.error("Error fetching listings:", err);
      }
      setLoading(false);
    }

    fetchListings();
  }, []);

  // Staff action: set main photo
  const setMainPhoto = async (photoId) => {
    try {
      await fetch(`http://localhost:5000/photos/${photoId}/main`, {
        method: "PATCH",
      });
      // Refresh listings after update
      const res = await fetch("http://localhost:5000/listings");
      const data = await res.json();
      setListings(data || []);
    } catch (err) {
      console.error("Error setting main photo:", err);
    }
  };

  // Staff action: set winner photo
  const setWinnerPhoto = async (photoId) => {
    try {
      await fetch(`http://localhost:5000/photos/${photoId}/winner`, {
        method: "PATCH",
      });
      // Refresh listings after update
      const res = await fetch("http://localhost:5000/listings");
      const data = await res.json();
      setListings(data || []);
    } catch (err) {
      console.error("Error setting winner:", err);
    }
  };

  if (loading) return <p>Loading listings...</p>;

  return (
    <div style={{ padding: "20px" }}>
      <h1>
        {mode === "tag" ? "ArborTag" : "ArborDex"} — Tree & Plant Listings
      </h1>
      {listings.length === 0 && <p>No listings found.</p>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "20px",
          marginTop: "20px",
        }}
      >
        {listings.map((listing) => {
          const mainPhoto =
            listing.photos?.find((p) => p.is_main) ||
            listing.photos?.[0] ||
            null;

          return (
            <div
              key={listing.id}
              style={{
                border: "1px solid #ccc",
                borderRadius: "8px",
                padding: "15px",
                background: "#fafafa",
              }}
            >
              {/* Main Photo */}
              {mainPhoto ? (
                <img
                  src={mainPhoto.url}
                  alt="Main"
                  style={{
                    width: "100%",
                    height: "180px",
                    objectFit: "cover",
                    borderRadius: "6px",
                    marginBottom: "10px",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "180px",
                    background: "#ddd",
                    borderRadius: "6px",
                    marginBottom: "10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#555",
                  }}
                >
                  No photos yet
                </div>
              )}

              {/* Listing Info */}
              <h3>{listing.title}</h3>
              <p>{listing.description}</p>
              <p style={{ fontStyle: "italic", color: "#666" }}>
                {listing.location}
              </p>

              {/* View Listing */}
              <Link to={`/listing/${listing.id}`}>
                <button style={{ marginTop: "10px" }}>View Listing</button>
              </Link>

              {/* Staff Controls */}
              {mode === "dex" && listing.photos?.length > 0 && (
                <div style={{ marginTop: "15px" }}>
                  <h4>Staff Tools</h4>

                  {listing.photos.map((photo) => (
                    <div
                      key={photo.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: "8px",
                        gap: "10px",
                      }}
                    >
                      <img
                        src={photo.url}
                        alt="thumb"
                        style={{
                          width: "50px",
                          height: "50px",
                          objectFit: "cover",
                          borderRadius: "4px",
                        }}
                      />

                      <div style={{ flexGrow: 1 }}>
                        <p style={{ margin: 0 }}>
                          {photo.photographer
                            ? `📸 ${photo.photographer}`
                            : "No credit"}
                        </p>
                        {photo.winner && (
                          <span style={{ color: "green", fontWeight: "bold" }}>
                            ⭐ Winner
                          </span>
                        )}
                      </div>

                      <button onClick={() => setMainPhoto(photo.id)}>
                        Set Main
                      </button>

                      <button onClick={() => setWinnerPhoto(photo.id)}>
                        Set Winner
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}