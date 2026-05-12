// tests/fixtures/reducer-scatter.tsx
// useReducer wearing a moustache: every case is just spread-and-set. This is
// useState scatter with extra steps — the rule should still flag it.
import { useReducer } from "react";

interface State {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  zip: string;
  bio: string;
}

type Action =
  | { type: "SET_FIRST_NAME"; payload: string }
  | { type: "SET_LAST_NAME"; payload: string }
  | { type: "SET_EMAIL"; payload: string }
  | { type: "SET_PHONE"; payload: string }
  | { type: "SET_CITY"; payload: string }
  | { type: "SET_COUNTRY"; payload: string }
  | { type: "SET_ZIP"; payload: string }
  | { type: "SET_BIO"; payload: string };

const initialState: State = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  city: "",
  country: "",
  zip: "",
  bio: "",
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_FIRST_NAME":
      return { ...state, firstName: action.payload };
    case "SET_LAST_NAME":
      return { ...state, lastName: action.payload };
    case "SET_EMAIL":
      return { ...state, email: action.payload };
    case "SET_PHONE":
      return { ...state, phone: action.payload };
    case "SET_CITY":
      return { ...state, city: action.payload };
    case "SET_COUNTRY":
      return { ...state, country: action.payload };
    case "SET_ZIP":
      return { ...state, zip: action.payload };
    case "SET_BIO":
      return { ...state, bio: action.payload };
    default:
      return state;
  }
}

export function ProfileFormReducer() {
  const [state, dispatch] = useReducer(reducer, {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    city: "",
    country: "",
    zip: "",
    bio: "",
  });

  return (
    <form
      onClick={() => dispatch({ type: "SET_FIRST_NAME", payload: "x" })}
    >
      {state.firstName}
    </form>
  );
}

// Negative: a reducer that actually branches on state earns the discount.
export function ToggleReducer() {
  const [state, dispatch] = useReducer(
    (s: { count: number; open: boolean }, action: { type: string }) => {
      switch (action.type) {
        case "INC":
          if (s.count >= 10) return { ...s, open: false };
          return { ...s, count: s.count + 1 };
        case "TOGGLE":
          return { ...s, open: !s.open };
        default:
          return s;
      }
    },
    { count: 0, open: false },
  );

  return (
    <button onClick={() => dispatch({ type: "INC" })}>
      {state.count} {state.open ? "open" : "shut"}
    </button>
  );
}
