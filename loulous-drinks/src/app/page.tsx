import { redirect } from "next/navigation";
import { publicEnv } from "@/lib/env";

// The root of the site sends guests to the default restaurant's menu. In a
// multi-restaurant future this could become a landing page.
export default function Home() {
  redirect(`/${publicEnv.defaultRestaurantSlug}`);
}
