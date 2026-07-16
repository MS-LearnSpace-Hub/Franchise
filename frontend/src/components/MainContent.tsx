import React from 'react';
import { Page } from '../App';
import SummaryBar from './SummaryBar';
import dashboardImg from '../images/Dashboard.png';

interface MainContentProps {
    navigateTo: (page: Page) => void;
}

interface WelcomeBarProps {
    navigateTo: (page: Page) => void;
}
const WelcomeBar: React.FC<WelcomeBarProps> = ({ navigateTo }) => {



    const savedUser = localStorage.getItem('user');
    const user = savedUser ? JSON.parse(savedUser) : null;

    return (
        <div className="bg-white shadow-sm">
            <div className="container-fluid mx-auto px-4">
                <div className="flex items-center justify-between flex-wrap">
                    <div className="py-4 flex items-center">
                        <h2 className="text-xl text-gray-800 mr-4">Welcome, <span className="font-semibold">{user?.username || 'User'}</span></h2>



                    </div>

                </div>
            </div>
        </div>
    );
};

const DashboardHome: React.FC = () => {
  return (
    <div className="p-4 md:p-4 space-y-4">
      {/* This style block is *not* needed for image_4.png, 
        as the curve is baked into the image itself.
        If you want to apply a curve with CSS to a square image,
        you can use the approach from my previous response.
      */}

      <div>
        <SummaryBar />

        {/* Wrapped the image in a flex container to center it perfectly */}
        <div className="flex justify-center w-full mt-10">
          <img
            src={dashboardImg}
            alt="Dashboard Illustration"
            // The existing shadow and border-radius are sufficient
            className="w-full h-auto rounded-lg shadow-sm"
            style={{ maxHeight: '60vh', objectFit: 'contain' }}
          />
        </div>
      </div>
    </div>
  );
};

const MainContent: React.FC<MainContentProps> = ({ navigateTo }) => {
    return (
        <>
            <WelcomeBar navigateTo={navigateTo} />
            <DashboardHome />
        </>
    );
};

export default MainContent;