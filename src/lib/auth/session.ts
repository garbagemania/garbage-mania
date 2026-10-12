import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Role } from "@/types/roles";


export class AuthenticationError extends Error {
  constructor(message = "No signed-in user.") {
    super(message);
    this.name = "AuthenticationError";
  }
}


export class AuthorizationError extends Error {
  constructor(message = "Not authorized.") {
    super(message);
    this.name = "AuthorizationError";
  }
}



export interface StaffProfileInfo {
  employeeNumber: string;
  department: string | null;
  isActive: boolean;
}


export interface CustomerProfileInfo {
  customerId: string;
  isPrimaryContact: boolean;
}


export interface DriverInfo {
  licenseNumber: string;
  status: "active" | "suspended" | "inactive";
}



export interface AppUser {
  id: string;
  email: string | null;
  phone: string | null;

  role: Role | null;

  kind: "staff" | "customer" | null;

  fullName: string | null;

  status: "active" | "suspended" | "disabled" | null;

  staffProfile: StaffProfileInfo | null;

  customerProfile: CustomerProfileInfo | null;

  driver: DriverInfo | null;
}



function emptyUser(
  id:string,
  email:string|null,
  phone:string|null
):AppUser {

  return {
    id,
    email,
    phone,
    role:null,
    kind:null,
    fullName:null,
    status:null,
    staffProfile:null,
    customerProfile:null,
    driver:null,
  };

}



export async function getCurrentUser():Promise<AppUser|null>{

  const supabase=createSupabaseServerClient();


  const {
    data:{
      user
    }
  }=await supabase.auth.getUser();


  if(!user) return null;



  const appUser=emptyUser(
    user.id,
    user.email ?? null,
    user.phone ?? null
  );



  const {
    data:profile
  }=await supabase
    .from("profiles")
    .select(
      "kind,full_name,phone,status,role_id"
    )
    .eq(
      "id",
      user.id
    )
    .maybeSingle();



  if(!profile){
    return appUser;
  }



  let roleCode:Role|null=null;



  if(profile.role_id){

    const {
      data:role
    }=await supabase
      .from("roles")
      .select("code")
      .eq(
        "id",
        profile.role_id
      )
      .maybeSingle();


    if(role?.code){
      roleCode=role.code as Role;
    }

  }



  appUser.role=roleCode;

  appUser.kind=profile.kind;

  appUser.fullName=profile.full_name;

  appUser.status=profile.status;



  if(profile.kind==="customer"){

    const {
      data:customerProfile
    }=await supabase
      .from("customer_profiles")
      .select(
        "customer_id,is_primary_contact"
      )
      .eq(
        "id",
        user.id
      )
      .maybeSingle();



    if(customerProfile){

      appUser.customerProfile={
        customerId:customerProfile.customer_id,
        isPrimaryContact:
          customerProfile.is_primary_contact,
      };

    }

  }



  if(profile.kind==="staff"){

    const {
      data:staffProfile
    }=await supabase
      .from("staff_profiles")
      .select(
        "employee_number,department,is_active"
      )
      .eq(
        "id",
        user.id
      )
      .maybeSingle();



    if(staffProfile){

      appUser.staffProfile={
        employeeNumber:
          staffProfile.employee_number,

        department:
          staffProfile.department,

        isActive:
          staffProfile.is_active,
      };

    }


    // Drivers are staff with an extra `drivers` row (license, status).
    // requireDriver() in rbac.ts depends on this being populated.
    if(roleCode==="driver"){

      const {
        data:driver
      }=await supabase
        .from("drivers")
        .select(
          "license_number,status"
        )
        .eq(
          "id",
          user.id
        )
        .maybeSingle();


      if(driver){

        appUser.driver={
          licenseNumber:
            driver.license_number,

          status:
            driver.status,
        };

      }

    }

  }



  return appUser;

}





export async function requireAuthenticatedUser(){

  const user=await getCurrentUser();


  if(!user){
    throw new AuthenticationError();
  }


  return user;

}
