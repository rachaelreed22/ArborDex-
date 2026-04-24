import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useMode } from "../context/ModeContext";

export default function ArborTag() {
  const { id } = useParams(); // listing ID from URL
  const { mode } = useMode(); // "tag" = public, "dex" = staff

  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch listing data
  useEffect(() => {
    async function fetchListing() {
      try {
        const res = await fetch(`http://localhost:5000/listings/${id}`);
        const data = await res.json();
        setListing(data);
      } catch (err) {
        console.error("Error fetching listing:", err);
      }
      setLoading(false);
    }

    fetchListing();
  }, [id]);

  if (loading) return <p>Loading tree...</p>;
  if (!listing) return <p>Tree not found.</p>;

  const photos = listing.photos || [];
  const mainPhoto =
    photos.find((p) => p.is_main) || photos[0] || null;
  const winnerPhoto = photos.find((p) => p.winner) || null;

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "20px",
        textAlign: "center",
      }}
    >
      {/* Title */}
      <h1 style={{ marginBottom: "10px" }}>{listing.title}</h1>

      {/* Location */}
      <p style={{ color: "#666", marginBottom: "20px" }}>
        {listing.location}
      </p>

      {/* Main Photo */}
      {mainPhoto ? (
        <div style={{ marginBottom: "20px" }}>
          <img
            src={mainPhoto.url}
            alt="Main"
            style={{
              width: "100%",
              maxHeight: "450px",
              objectFit: "cover",
              borderRadius: "10px",
            }}
          />

          {/* Photographer credit */}
          {mainPhoto.photographer && (
            <p style={{ marginTop: "8px", fontStyle: "italic" }}>
              📸 {mainPhoto.photographer}
            </p>
          )}
        </div>
      ) : (
        <p>No photos available yet.</p>
      )}

      {/* Winner Badge */}
      {winnerPhoto && (
        <div
          style={{
            background: "#e8ffe8",
            padding: "10px",
            borderRadius: "8px",
            marginBottom: "20px",
            display: "inline-block",
          }}
        >
          <strong>⭐ Photo Contest Winner</strong>
          <br />
          <img
            src={winnerPhoto.url}
            alt="Winner"
            style={{
              width: "200px",
              height: "200px",
              objectFit: "cover",
              borderRadius: "8px",
              marginTop: "10px",
            }}
          />
          {winnerPhoto.photographer && (
            <p style={{ marginTop: "5px", fontStyle: "italic" }}>
              📸 {winnerPhoto.photographer}
            </p>
          )}
        </div>
      )}

      {/* Description */}
      <p
        style={{
          marginTop: "20px",
          marginBottom: "30px",
          fontSize: "18px",
          lineHeight: "1.5",
        }}
      >
        {listing.description}
      </p>

      {/* Photo Gallery */}
      {photos.length > 1 && (
        <div>
          <h3>Photo Gallery</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "15px",
              marginTop: "15px",
            }}
          >
            {photos.map((photo) => (
              <div key={photo.id}>
                <img
                  src={photo.url}
                  alt="Gallery"
                  style={{
                    width: "100%",
                    height: "150px",
                    objectFit: "cover",
                    borderRadius: "6px",
                  }}
                />
                {photo.photographer && (
                  <p
                    style={{
                      fontSize: "12px",
                      marginTop: "5px",
                      fontStyle: "italic",
                    }}
                  >
                    📸 {photo.photographer}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff Mode Debug Info */}
      {mode === "dex" && (
        <div
          style={{
            marginTop: "40px",
            padding: "15px",
            border: "1px dashed #aaa",
            borderRadius: "8px",
            background: "#f9f9f9",
          }}
        >
          <h3>Staff Mode</h3>
          <p>Listing ID: {listing.id}</p>
          <p>Total Photos: {photos.length}</p>
        </div>
      )}
    </div>
  );
}
