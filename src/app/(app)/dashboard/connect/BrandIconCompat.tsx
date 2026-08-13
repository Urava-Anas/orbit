import type { SVGProps } from "react";
import { BrandLogo } from "./BrandLogo";

type Props = SVGProps<SVGSVGElement>;

export function SiGithub(props: Props) {
  return <BrandLogo name="github" className={props.className} />;
}

export function SiVercel(props: Props) {
  return <BrandLogo name="vercel" className={props.className} />;
}

export function SiGoogle(props: Props) {
  return <BrandLogo name="google" className={props.className} />;
}

export function SiGoogleanalytics(props: Props) {
  return <BrandLogo name="analytics" className={props.className} />;
}

export function SiMeta(props: Props) {
  return <BrandLogo name="meta" className={props.className} />;
}

export function SiLinkedin(props: Props) {
  return <BrandLogo name="linkedin" className={props.className} />;
}

export function SiOpenai(props: Props) {
  return <BrandLogo name="openai" className={props.className} />;
}
