
import React from 'react';

interface StarRatingProps {
  rating: number;
  onChange: (rating: number) => void;
}

const StarRating: React.FC<StarRatingProps> = ({ rating, onChange }) => {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`text-xl transition-all hover:scale-110 active:scale-90 ${
            star <= rating ? 'text-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]' : 'text-slate-800'
          }`}
        >
          <i className={`fa-star ${star <= rating ? 'fa-solid' : 'fa-regular'}`}></i>
        </button>
      ))}
    </div>
  );
};

export default StarRating;
