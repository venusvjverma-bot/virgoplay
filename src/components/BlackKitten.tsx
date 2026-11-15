import './BlackKitten.css';

interface BlackKittenProps {
  size?: number;
  className?: string;
}

const KITTEN_APNG_URL = '/kitten-signup-apng.png';

export default function BlackKitten({ size = 86, className = '' }: BlackKittenProps) {
  return (
    <div className={`black-kitten ${className}`} style={{ width: size, height: size }}>
      <img
        className="black-kitten__image"
        src={KITTEN_APNG_URL}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </div>
  );
}
