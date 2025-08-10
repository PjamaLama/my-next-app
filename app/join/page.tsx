"use client";

import React, { useEffect, useState } from "react";
import { useFirebase } from "../providers/FirebaseProvider";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function JoinPage() {
  // Hard redirect to landing; join handled directly there now
  if (typeof window !== 'undefined') {
    window.location.replace('/');
  }
  return null;
}


