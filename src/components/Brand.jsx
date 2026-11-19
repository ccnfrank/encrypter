import { BrandMark } from "./icons.jsx";

export default function Brand() {
  return (
    <a className="brand" href="./">
      <BrandMark />
      <span>
        encryter<span className="brand-tld">.app</span>
      </span>
    </a>
  );
}
