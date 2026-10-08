/** The signed-in person as the rest of the app sees it. No auth-library types leak out. */
export interface Actor {
  id: string;
  name: string;
  email: string;
  image: string | null;
}
