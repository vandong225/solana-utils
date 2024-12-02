import React from "react";
import WalletConnection from "./WalletConnection";

const Header = () => {
  return (
    <div className="h-[10vh] bg-black flex justify-center">
      <div className="max-w-full w-full flex justify-between items-center px-8">
        <div className="text-white font-bold text-[30px]">Solana Utils</div>
        <div>
          <WalletConnection />
        </div>
      </div>
    </div>
  );
};

export default Header;
