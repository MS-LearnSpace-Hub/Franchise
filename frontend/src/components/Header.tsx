import React, { useState, useEffect } from 'react';
import { ChevronDownIcon, UserIcon, LogoutIcon, MenuIcon, ArrowBackIcon, ArrowForwardIcon, HomeIcon } from './icons';
import { Page } from '../App';
import api from '../api';
import Learnspacelogo1 from '../images/Learnspacelogo1.png';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  toggleSidebar: () => void;
  navigateTo: (page: Page) => void;
  onLogout: () => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
}



const Header: React.FC<HeaderProps> = ({ toggleSidebar, navigateTo, onLogout, goBack, goForward, canGoBack, canGoForward }) => {
  const { user: authUser, switchContext } = useAuth();
  const user = authUser || JSON.parse(localStorage.getItem('user') || '{}');

  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [schoolDropdownOpen, setSchoolDropdownOpen] = useState(false);

  // State for Location → School → Branch cascade
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(localStorage.getItem('currentLocation') || 'All');
  const [selectedSchool, setSelectedSchool] = useState(localStorage.getItem('currentSchool') || 'All');
  const [selectedSchoolId, setSelectedSchoolId] = useState(localStorage.getItem('currentSchoolId') || 'All');
  const [allBranchesData, setAllBranchesData] = useState<any[]>([]);

  // Dynamic Locations State
  const [locationData, setLocationData] = useState<any[]>([]);

  // Resolve dynamic logo and school info from AuthContext
  const isAllSchools = selectedSchoolId === 'All' || selectedSchool === 'All Schools' || !user.school_id;
  const rawLogo = user.school_logo || null;
  // Use relative path — Vite proxy forwards /static/* to the Flask backend
  const schoolLogo = (isAllSchools || !rawLogo) ? Learnspacelogo1 : rawLogo;
  const schoolName = isAllSchools ? 'LearnSpace' : (user.school_name || 'LearnSpace');
  const branchLabel = isAllSchools ? 'All Branches' : (user.branch_name || user.branch || '');
  const themeColor = isAllSchools ? '#2b8144' : (user.school_theme || '#009746');

  // Initialize selected location on mount
  useEffect(() => {
    if (user.role === 'Admin' || user.role === 'SuperAdmin') {
      // Fetch All Branches with metadata
      api.get('/branches').then(res => {
        if (res.data.branches) {
          setAllBranchesData(res.data.branches);
        }
      }).catch(err => console.error("Header branch fetch error:", err));
    }
  }, []); // Run once

  const isSuperAdmin = user.role === 'SuperAdmin';
  const isAdminLevel = user.role === 'Admin' || isSuperAdmin;
  const allowedSchools = user.allowed_schools || [];

  // ── School options: derived from allBranchesData for Admin/SuperAdmin, or user's allowed_schools ──
  const schoolOptions: { id: string; name: string }[] = [];
  const seenSchools = new Set<string>();

  if (isAdminLevel && allBranchesData.length > 0) {
    for (const b of allBranchesData) {
      if (selectedLocation !== 'All' && b.location_name !== selectedLocation) {
        continue;
      }
      const key = String(b.school_id);
      if (b.school_id && !seenSchools.has(key)) {
        seenSchools.add(key);
        schoolOptions.push({ id: key, name: b.school_name || 'Unknown School' });
      }
    }
  } else if (allowedSchools.length > 0) {
    for (const s of allowedSchools) {
      const key = String(s.school_id);
      if (!seenSchools.has(key)) {
        seenSchools.add(key);
        schoolOptions.push({ id: key, name: s.school_name });
      }
    }
  }

  // ── Branch options: filtered by location + school ──
  let branchOptions: string[] = [];

  if (isAdminLevel && allBranchesData.length > 0) {
    let filtered = allBranchesData;

    // Filter by location
    if (selectedLocation !== 'All') {
      filtered = filtered.filter(b => b.location_name === selectedLocation);
    }

    // Filter by selected school (for all admin-level roles)
    if (selectedSchoolId !== 'All') {
      filtered = filtered.filter(b => String(b.school_id) === selectedSchoolId);
    }

    branchOptions = ["All Branches", ...filtered.map(b => b.branch_name)];
  } else {
    // Non-admin level users (e.g. Franchise or Branch level users)
    let allowed = user?.allowed_branches || [];

    // Filter by selected school
    if (selectedSchoolId !== 'All') {
      allowed = allowed.filter((b: any) => String(b.school_id) === selectedSchoolId);
    }

    branchOptions = allowed.map((b: any) => b.branch_name);

    if (branchOptions.length === 0 && user?.branch) {
      branchOptions = [user.branch];
    }

    const hasMultiple = branchOptions.length > 1;
    const canViewAll = branchOptions.includes("All") || user?.branch === "All" || user?.allowed_branches?.some((b: any) => b.branch_name === "All");
    if (hasMultiple && !branchOptions.includes("All Branches") && (canViewAll || hasMultiple)) {
      branchOptions = ["All Branches", ...branchOptions.filter((b: string) => b !== 'All' && b !== 'All Branches')];
    }
  }

  const showDropdown = user && (isAdminLevel || branchOptions.length > 1);

  const [selectedYear, setSelectedYear] = useState(localStorage.getItem('academicYear') || '');
  const [currentBranch, setCurrentBranch] = useState(() => {
    return localStorage.getItem('currentBranch') || user.branch || 'All';
  });

  const handleYearChange = (year: string) => {
    localStorage.setItem('academicYear', year);
    setSelectedYear(year);
    setYearDropdownOpen(false);
    window.location.reload();
  };

  const handleLocationChange = (loc: string) => {
    localStorage.setItem('currentLocation', loc);
    localStorage.setItem('currentSchool', 'All');
    localStorage.setItem('currentSchoolId', 'All');
    localStorage.setItem('currentBranch', 'All');
    setSelectedLocation(loc);
    setSelectedSchool('All');
    setSelectedSchoolId('All');
    setCurrentBranch('All');
    setLocationDropdownOpen(false);
    window.location.reload();
  };

  const handleSchoolChange = async (schoolId: string, schoolName: string) => {
    try {
      const sId = schoolId === 'All' ? null : Number(schoolId);
      
      let defaultBranchName = 'All';
      let defaultBranchId: string | null = null;

      if (sId !== null) {
        // Find branches for this school
        let schoolBranches: any[] = [];
        if (isAdminLevel && allBranchesData.length > 0) {
          schoolBranches = allBranchesData.filter(b => b.school_id === sId);
          if (selectedLocation !== 'All') {
            schoolBranches = schoolBranches.filter(b => b.location_name === selectedLocation);
          }
        } else {
          schoolBranches = (user.allowed_branches || []).filter((b: any) => b.school_id === sId);
        }

        if (schoolBranches.length > 0) {
          defaultBranchName = schoolBranches[0].branch_name;
          defaultBranchId = String(schoolBranches[0].id || schoolBranches[0].branch_id);
        }
      }

      const bId = defaultBranchId ? Number(defaultBranchId) : null;
      await switchContext(sId, bId);
      
      localStorage.setItem('currentSchool', schoolName);
      localStorage.setItem('currentSchoolId', schoolId);
      
      localStorage.setItem('currentBranch', defaultBranchName);
      if (defaultBranchId) {
        localStorage.setItem('currentBranchId', defaultBranchId);
      } else {
        localStorage.removeItem('currentBranchId');
      }

      setSelectedSchool(schoolName);
      setSelectedSchoolId(schoolId);
      setCurrentBranch(defaultBranchName);
      setSchoolDropdownOpen(false);
      window.location.reload();
    } catch (err) {
      console.error("Context school switch failed:", err);
    }
  };

  const handleBranchChange = async (branchName: string) => {
    try {
      const val = branchName === 'All Branches' ? 'All' : branchName;
      let branchId: number | null = null;
      let schoolId: number | null = null;
      let schoolName: string | null = null;

      if (val !== 'All') {
        // Look up branch ID from allowed_branches first
        const allowedFound = user.allowed_branches?.find((b: any) => b.branch_name === branchName);
        if (allowedFound) {
          branchId = allowedFound.branch_id;
          schoolId = allowedFound.school_id;
          const sFound = allowedSchools.find((s: any) => s.school_id === schoolId);
          if (sFound) schoolName = sFound.school_name;
        } else {
          const found = allBranchesData.find(b => b.branch_name === branchName);
          if (found) {
            branchId = found.id || found.branch_id;
            schoolId = found.school_id;
            schoolName = found.school_name;
          }
        }
      }

      await switchContext(null, branchId);
      localStorage.setItem('currentBranch', val);
      if (branchId) {
        localStorage.setItem('currentBranchId', String(branchId));
      } else {
        localStorage.removeItem('currentBranchId');
      }

      if (val === 'All') {
        localStorage.removeItem('currentSchoolId');
        localStorage.removeItem('currentSchool');
        setSelectedSchool('All');
        setSelectedSchoolId('All');
      } else {
        if (schoolId) {
          localStorage.setItem('currentSchoolId', String(schoolId));
        }
        if (schoolName) {
          localStorage.setItem('currentSchool', schoolName);
        }
      }

      setCurrentBranch(val);
      setBranchDropdownOpen(false);
      window.location.reload();
    } catch (err) {
      console.error("Context branch switch failed:", err);
    }
  };

  // Dynamic Academic Years
  const [academicYearOptions, setAcademicYearOptions] = useState<string[]>([]);

  useEffect(() => {
    api.get('/org/academic-years')
      .then(res => {
        const yearsList = res.data.academic_years || [];
        setAcademicYearOptions(yearsList.map((y: any) => y.name));

        // Auto-select first year if localStorage is empty
        const storedYear = localStorage.getItem('academicYear');
        if (!storedYear && yearsList.length > 0) {
          const firstYear = yearsList[0].name;
          localStorage.setItem('academicYear', firstYear);
          setSelectedYear(firstYear);
        }
      })
      .catch(err => console.error("Failed to load academic years in Header", err));
  }, []);

  const years = academicYearOptions.length > 0 ? academicYearOptions : [];

  // Dynamic Locations
  const [locationList, setLocationList] = useState<string[]>(['All']);

  useEffect(() => {
    if (user.role === 'SuperAdmin') {
      api.get('/org/locations')
        .then(res => {
          const locs = res.data.locations || [];
          setLocationData(locs);
          const names = locs.map((l: any) => l.name);
          setLocationList(['All', ...names]);
        })
        .catch(err => console.error("Failed to load locations in Header", err));
    }
  }, [user.role]);

  useEffect(() => {
    if (user.role === 'Admin' && allBranchesData.length > 0) {
      const branchLocations = Array.from(new Set(
        allBranchesData
          .map(b => b.location_name)
          .filter(name => name && name !== 'Unknown Location')
      ));

      setLocationList(branchLocations);

      // Auto-set selectedLocation if current value is invalid or 'All'
      const currentLoc = localStorage.getItem('currentLocation');
      if (!currentLoc || currentLoc === 'All' || !branchLocations.includes(currentLoc)) {
        const defaultLoc = branchLocations[0] || 'All';
        localStorage.setItem('currentLocation', defaultLoc);
        setSelectedLocation(defaultLoc);
      }
    }
  }, [allBranchesData, user.role]);

  return (
    <header
      className="text-white shadow-lg z-10 transition-colors duration-500"
      style={{
        backgroundColor: themeColor,
        '--hover-bg': `color-mix(in srgb, ${themeColor} 80%, black)`
      } as React.CSSProperties}
    >
      <nav className="container-fluid mx-auto px-4">
        {/* ... (existing nav structure) ... */}
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <button onClick={toggleSidebar} className="text-white hover:bg-green-600 p-2 rounded-md focus:outline-none md:hidden mr-2">
              <MenuIcon className="w-6 h-6" />
            </button>
            <a href="#" onClick={() => navigateTo('dashboard')} className="flex items-center space-x-2">
              <img
                src={schoolLogo}
                alt={schoolName}
                className="h-14 w-auto max-w-[140px] object-contain rounded-sm"
                onError={(e) => { (e.target as HTMLImageElement).src = Learnspacelogo1; }}
              />
              <div className="hidden md:block leading-tight">
                <p className="font-bold text-sm tracking-wide">{schoolName}</p>
                {branchLabel && (
                  <p className="text-xs text-green-100 font-medium">{branchLabel}</p>
                )}
              </div>
            </a>
            <div className="hidden md:flex items-center ml-4">

            </div>
          </div>

          <div className="flex items-center space-x-2 md:space-x-4">

            {/* Location Dropdown (Admin / SuperAdmin Only) */}
            {(user.role === 'Admin' || user.role === 'SuperAdmin') && locationList.length > 1 && (
              <div className="relative mr-2">
                <button
                  onClick={() => setLocationDropdownOpen(!locationDropdownOpen)}
                  onBlur={() => setTimeout(() => setLocationDropdownOpen(false), 200)}
                  className="flex items-center space-x-1 hover:bg-green-600 p-2 rounded-md focus:outline-none"
                >
                  <span className="font-semibold">{selectedLocation === 'All' ? 'All Locations' : selectedLocation}</span>
                  <ChevronDownIcon className="w-4 h-4" />
                </button>
                {locationDropdownOpen && (
                  <ul className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-30 text-gray-700">
                    {locationList.map(loc => (
                      <li key={loc}>
                        <a
                          href="#"
                          onClick={(e) => { e.preventDefault(); handleLocationChange(loc); }}
                          className={`block px-4 py-2 text-sm hover:bg-gray-100 ${selectedLocation === loc ? 'font-bold text-green-700 bg-green-100' : ''}`}
                        >
                          {loc === 'All' ? 'All Locations' : loc}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* School Dropdown */}
            {(isSuperAdmin || schoolOptions.length > 1) && (
              <div className="relative mr-2">
                <button
                  onClick={() => setSchoolDropdownOpen(!schoolDropdownOpen)}
                  onBlur={() => setTimeout(() => setSchoolDropdownOpen(false), 200)}
                  className="flex items-center space-x-1 hover:bg-green-600 p-2 rounded-md focus:outline-none"
                >
                  <span className="font-semibold">{selectedSchool === 'All' ? 'All Schools' : selectedSchool}</span>
                  <ChevronDownIcon className="w-4 h-4" />
                </button>
                {schoolDropdownOpen && (
                  <ul className="absolute right-0 mt-2 w-52 bg-white rounded-md shadow-lg py-1 z-30 text-gray-700 max-h-60 overflow-auto">
                    {(isSuperAdmin || schoolOptions.length > 1) && (
                      <li>
                        <a
                          href="#"
                          onClick={(e) => { e.preventDefault(); handleSchoolChange('All', 'All'); }}
                          className={`block px-4 py-2 text-sm hover:bg-gray-100 ${selectedSchoolId === 'All' ? 'font-bold text-green-700 bg-green-100' : ''}`}
                        >
                          All Schools
                        </a>
                      </li>
                    )}
                    {schoolOptions.map(s => (
                      <li key={s.id}>
                        <a
                          href="#"
                          onClick={(e) => { e.preventDefault(); handleSchoolChange(s.id, s.name); }}
                          className={`block px-4 py-2 text-sm hover:bg-gray-100 ${selectedSchoolId === s.id ? 'font-bold text-green-700 bg-green-100' : ''}`}
                        >
                          {s.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Branch Dropdown */}
            {showDropdown ? (
              <div className="relative">
                <button
                  onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
                  onBlur={() => setTimeout(() => setBranchDropdownOpen(false), 200)}
                  className="flex items-center space-x-1 hover:bg-green-600 p-2 rounded-md focus:outline-none"
                >
                  <span className="font-semibold">{currentBranch === 'All' ? 'All Branches' : currentBranch}</span>
                  <ChevronDownIcon className="w-4 h-4" />
                </button>
                {branchDropdownOpen && (
                  <ul className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-30 text-gray-700 max-h-60 overflow-auto">
                    {branchOptions.map((branch: string) => (
                      <li key={branch}>
                        <a
                          href="#"
                          onClick={(e) => { e.preventDefault(); handleBranchChange(branch === 'All Branches' ? 'All' : branch); }}
                          className={`block px-4 py-2 text-sm hover:bg-gray-100 ${currentBranch === (branch === 'All Branches' ? 'All' : branch) ? 'font-bold text-green-700' : ''}`}
                        >
                          {branch}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              // Single Branch Display
              <div className="flex items-center space-x-1 p-2 rounded-md">
                <span className="font-semibold">{currentBranch === 'All' ? 'All Branches' : currentBranch}</span>
              </div>
            )}

            {/* Year Dropdown */}
            <div className="relative">
              <button
                onClick={() => setYearDropdownOpen(!yearDropdownOpen)}
                onBlur={() => setTimeout(() => setYearDropdownOpen(false), 150)}
                className="flex items-center space-x-1 hover:bg-green-600 p-2 rounded-md focus:outline-none"
              >
                <span>{selectedYear}</span>
                <ChevronDownIcon className="w-4 h-4" />
              </button>
              {yearDropdownOpen && (
                <ul className="absolute right-0 mt-2 w-40 bg-white rounded-md shadow-lg py-1 z-30 text-gray-700">
                  {years.map(year => (
                    <li key={year}>
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); handleYearChange(year); }}
                        className="block px-4 py-2 text-sm hover:bg-gray-100"
                      >
                        {year}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>




            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                onBlur={() => setTimeout(() => setProfileDropdownOpen(false), 150)}
                className="flex items-center space-x-2 focus:outline-none hover:bg-green-600 p-1 rounded-md"
              >
                <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQpve8QCCPBiCCxagjx5ei3qUSB_7UyDEepfg&s" alt="Profile" className="w-8 h-8 rounded-full object-cover" />
                <span className="hidden md:inline">{JSON.parse(localStorage.getItem('user') || '{}').username || 'User'}</span>
                <ChevronDownIcon className="w-4 h-4" />
              </button>
              {profileDropdownOpen && (
                <ul className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-30 text-gray-700">
                  <li>
                    <a href="#" onClick={(e) => { e.preventDefault(); navigateTo('profile'); setProfileDropdownOpen(false); }} className="flex items-center px-4 py-2 text-sm hover:bg-gray-100">
                      <UserIcon className="w-4 h-4 mr-2" /> Profile
                    </a>
                  </li>
                  <li>
                    <button onClick={onLogout} className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none">
                      <LogoutIcon className="w-4 h-4 mr-2" /> Logout
                    </button>
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;